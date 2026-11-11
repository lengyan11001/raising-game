#!/usr/bin/env python3
"""Atomically switch managed Nginx upstreams to verified replacements.

This script is deliberately narrow. It edits only server directives inside
named upstream blocks whose backends are explicitly passed. It can either move
a single active backend or add an idempotent `backup` member beside an unchanged
primary. A transaction may span multiple Nginx files; every file is rendered
and validated in memory before any file is replaced. A short transaction
journal restores all files if validation, reload, or health checks fail, so
production cannot remain on a partially switched traffic mix. It never
restarts Node and never stops the old process; the caller drains old backends
only after every configured edge health check returns HTTP 200.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import fcntl
except ImportError:  # pragma: no cover - Linux production only
    fcntl = None


UPSTREAM_HEADER_RE = re.compile(
    r"(?<![A-Za-z0-9_])upstream\s+(?P<name>[A-Za-z0-9_.-]+)\s*\{"
)
SERVER_RE = re.compile(r"(?<![A-Za-z0-9_])server\s+(?P<args>[^;{}]*);")


def _masked(text: str) -> str:
    """Blank comments and quoted strings while preserving offsets and newlines."""
    chars = list(text)
    index = 0
    quote: str | None = None
    while index < len(chars):
        char = chars[index]
        if quote:
            if char == "\\":
                chars[index] = " "
                if index + 1 < len(chars):
                    chars[index + 1] = " "
                    index += 2
                    continue
            if char == quote:
                chars[index] = " "
                quote = None
            elif char != "\n":
                chars[index] = " "
        elif char in {"'", '"'}:
            chars[index] = " "
            quote = char
        elif char == "#":
            while index < len(chars) and chars[index] != "\n":
                chars[index] = " "
                index += 1
            continue
        index += 1
    return "".join(chars)


def _matching_brace(masked: str, opening: int) -> int:
    depth = 0
    for index in range(opening, len(masked)):
        if masked[index] == "{":
            depth += 1
        elif masked[index] == "}":
            depth -= 1
            if depth == 0:
                return index
    raise ValueError("unterminated upstream block")


def switch_upstreams_text(
    text: str, switches: list[tuple[str, str, str]]
) -> str:
    if not switches:
        raise ValueError("at least one upstream switch is required")
    names = [name for name, _, _ in switches]
    if len(names) != len(set(names)):
        raise ValueError("upstream names must be unique")

    masked = _masked(text)
    headers = list(UPSTREAM_HEADER_RE.finditer(masked))
    edits: list[tuple[int, int, str]] = []
    for name, current, next_backend in switches:
        matching = [header for header in headers if header.group("name") == name]
        if len(matching) != 1:
            raise ValueError(
                f"expected exactly one upstream {name!r}; found {len(matching)}"
            )

        header = matching[0]
        opening = header.end() - 1
        closing = _matching_brace(masked, opening)
        body_start = opening + 1
        body_end = closing
        body = text[body_start:body_end]
        masked_body = masked[body_start:body_end]
        servers = list(SERVER_RE.finditer(masked_body))
        if len(servers) != 1:
            raise ValueError(
                f"upstream {name!r} must contain exactly one server directive; found {len(servers)}"
            )

        server = servers[0]
        try:
            arguments = shlex.split(server.group("args"))
        except ValueError as error:
            raise ValueError(f"upstream {name!r} has an unparseable server directive") from error
        expected = f"127.0.0.1:{current}"
        if arguments != [expected]:
            raise ValueError(
                f"upstream {name!r} server must be exactly {expected}; found {arguments!r}"
            )

        start = body_start + server.start()
        end = body_start + server.end()
        replacement = f"server 127.0.0.1:{next_backend};"
        edits.append((start, end, replacement))

    # Preserve indentation and trailing tokens (for example `max_fails=...`)
    # on the managed member so a one-server upstream can become primary plus
    # backup without changing the primary's connection policy.
    rendered = text
    for start, end, replacement in sorted(edits, reverse=True):
        rendered = rendered[:start] + replacement + rendered[end:]
    return rendered


def switch_upstream_text(text: str, name: str, current: str, next_backend: str) -> str:
    return switch_upstreams_text(text, [(name, current, next_backend)])


def ensure_backup_upstreams_text(
    text: str, backups: list[tuple[str, str, str]]
) -> str:
    """Add one Nginx backup member while keeping the primary unchanged.

    The operation is idempotent: an upstream already containing exactly the
    requested primary and backup members is accepted without modification.
    Other server options are rejected so this cannot silently alter a tuned
    upstream.
    """
    if not backups:
        raise ValueError("at least one upstream backup is required")
    names = [name for name, _, _ in backups]
    if len(names) != len(set(names)):
        raise ValueError("upstream names must be unique")

    masked = _masked(text)
    headers = list(UPSTREAM_HEADER_RE.finditer(masked))
    edits: list[tuple[int, int, str]] = []
    for name, primary, backup in backups:
        matching = [header for header in headers if header.group("name") == name]
        if len(matching) != 1:
            raise ValueError(
                f"expected exactly one upstream {name!r}; found {len(matching)}"
            )

        header = matching[0]
        opening = header.end() - 1
        closing = _matching_brace(masked, opening)
        body_start = opening + 1
        body_end = closing
        masked_body = masked[body_start:body_end]
        servers = list(SERVER_RE.finditer(masked_body))
        expected_primary = f"127.0.0.1:{primary}"
        expected_backup = f"127.0.0.1:{backup}"
        parsed: list[tuple[re.Match[str], list[str]]] = []
        for server in servers:
            try:
                arguments = shlex.split(server.group("args"))
            except ValueError as error:
                raise ValueError(f"upstream {name!r} has an unparseable server directive") from error
            parsed.append((server, arguments))
        primary_members = [item for item in parsed if item[1] == [expected_primary]]
        backup_members = [item for item in parsed if item[1] == [expected_backup, "backup"]]
        if len(parsed) == 2 and len(primary_members) == 1 and len(backup_members) == 1:
            continue
        if len(parsed) != 1 or len(primary_members) != 1:
            found = [arguments for _server, arguments in parsed]
            raise ValueError(
                f"upstream {name!r} must be exactly {expected_primary}, or that primary "
                f"plus {expected_backup} backup; found {found!r}"
            )

        server, _arguments = primary_members[0]
        start = body_start + server.start()
        end = body_start + server.end()
        line_start = text.rfind("\n", 0, start) + 1
        leading = text[line_start:start]
        indent = leading if leading.strip() == "" else "    "
        replacement = (
            f"{text[start:end]}\n{indent}server {expected_backup} backup;"
        )
        edits.append((start, end, replacement))

    # Preserve indentation and trailing tokens (for example `max_fails=...`)
    # on the managed member so a one-server upstream can become primary plus
    # backup without changing the primary's connection policy.
    rendered = text
    for start, end, replacement in sorted(edits, reverse=True):
        rendered = rendered[:start] + replacement + rendered[end:]
    return rendered


def atomic_write(path: Path, value: str, mode: int) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, mode)
        os.replace(temp_name, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def require_http_200(url: str) -> None:
    result = subprocess.run(
        ["curl", "-sS", "--max-time", "10", "--output", "/dev/null", "--write-out", "%{http_code}", url],
        check=False,
        capture_output=True,
        text=True,
    )
    status = result.stdout.strip()
    if result.returncode != 0 or status != "200":
        detail = result.stderr.strip()
        suffix = f" ({detail})" if detail else ""
        raise RuntimeError(
            f"health check returned HTTP {status or 'unknown'}{suffix}: {url}"
        )


def parse_file_switch(value: str) -> tuple[Path, tuple[str, str, str]]:
    path_text, separator, switch_text = value.partition("=")
    if not separator or not path_text:
        raise argparse.ArgumentTypeError(
            "file switch must use PATH=NAME=CURRENT_PORT:NEXT_PORT"
        )
    return Path(path_text), parse_switch(switch_text)


def parse_backup(value: str) -> tuple[str, str, str]:
    match = re.fullmatch(
        r"(?P<name>[A-Za-z0-9_.-]+)=(?P<primary>[0-9]+):(?P<backup>[0-9]+)",
        value,
    )
    if not match:
        raise argparse.ArgumentTypeError(
            "backup must use NAME=PRIMARY_PORT:BACKUP_PORT"
        )
    name = match.group("name")
    primary = match.group("primary")
    backup = match.group("backup")
    for port, label in ((primary, "primary"), (backup, "backup")):
        if not 1 <= int(port) <= 65535:
            raise argparse.ArgumentTypeError(f"invalid {label} port: {port}")
    if primary == backup:
        raise argparse.ArgumentTypeError("primary and backup ports must differ")
    return name, primary, backup


def parse_file_backup(value: str) -> tuple[Path, tuple[str, str, str]]:
    path_text, separator, backup_text = value.partition("=")
    if not separator or not path_text:
        raise argparse.ArgumentTypeError(
            "file backup must use PATH=NAME=PRIMARY_PORT:BACKUP_PORT"
        )
    return Path(path_text), parse_backup(backup_text)


def build_file_transaction(
    file_switches: list[tuple[Path, tuple[str, str, str]]],
) -> list[tuple[str, Path, str, int, str]]:
    by_file: dict[Path, list[tuple[str, str, str]]] = {}
    names: list[str] = []
    for path, switch in file_switches:
        names.append(switch[0])
        by_file.setdefault(Path(path), []).append(switch)
    if len(names) != len(set(names)):
        raise ValueError("upstream names must be unique")
    entries: list[tuple[str, Path, str, int, str]] = []
    for path, switches in by_file.items():
        source = path.read_text(encoding="utf-8")
        updated = switch_upstreams_text(source, switches)
        entries.append((str(path), path, source, path.stat().st_mode & 0o777, updated))
    return entries


def build_backup_transaction(
    file_backups: list[tuple[Path, tuple[str, str, str]]],
) -> list[tuple[str, Path, str, int, str]]:
    by_file: dict[Path, list[tuple[str, str, str]]] = {}
    names: list[str] = []
    for path, backup in file_backups:
        names.append(backup[0])
        by_file.setdefault(Path(path), []).append(backup)
    if len(names) != len(set(names)):
        raise ValueError("upstream names must be unique")
    entries: list[tuple[str, Path, str, int, str]] = []
    for path, backups in by_file.items():
        source = path.read_text(encoding="utf-8")
        updated = ensure_backup_upstreams_text(source, backups)
        entries.append((str(path), path, source, path.stat().st_mode & 0o777, updated))
    return entries


def acquire_transaction_lock() -> object:
    if fcntl is None:
        raise RuntimeError("fcntl is required for atomic Nginx transactions")
    default_lock = "/run/nginx-upstream-switch.lock" if Path("/run").is_dir() else str(
        Path(tempfile.gettempdir()) / "nginx-upstream-switch.lock"
    )
    lock_path = Path(os.environ.get("NGINX_UPSTREAM_SWITCH_LOCK", default_lock))
    handle = open(lock_path, "a+", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise RuntimeError(f"another upstream switch is already running: {lock_path}") from None
    return handle


def write_journal(entries: list[tuple[str, Path, str, int, str]]) -> Path:
    journal_dir = Path(os.environ.get("NGINX_UPSTREAM_SWITCH_JOURNAL_DIR", tempfile.gettempdir()))
    fd, journal_name = tempfile.mkstemp(
        prefix="raising-game-nginx-switch-", suffix=".json", dir=str(journal_dir)
    )
    journal = Path(journal_name)
    payload = {
        "files": [
            {"path": path_text, "original": original, "mode": mode}
            for path_text, _path, original, mode, _updated in entries
        ]
    }
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(journal, 0o600)
    return journal


def restore_journal(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    restored: list[str] = []
    for item in payload.get("files", []):
        target = Path(item["path"])
        atomic_write(target, item["original"], int(item["mode"]))
        restored.append(str(target))
    return restored


def recover_stale_journal() -> None:
    """Restore an interrupted transaction before starting another one."""
    stale_limit = 3600
    journal_dir = Path(os.environ.get("NGINX_UPSTREAM_SWITCH_JOURNAL_DIR", tempfile.gettempdir()))
    for journal in sorted(journal_dir.glob("raising-game-nginx-switch-*.json")):
        try:
            age = __import__("time").time() - journal.stat().st_mtime
            if age < 0 or age > stale_limit:
                continue
            restored = restore_journal(journal)
            journal.unlink()
            print(
                "UPSTREAM_SWITCH_RECOVERED journal="
                f"{journal} files={len(restored)}"
            )
        except Exception as error:
            print(f"UPSTREAM_SWITCH_RECOVERY_FAILED journal={journal} error={error}", file=sys.stderr)


def parse_switch(value: str) -> tuple[str, str, str]:
    match = re.fullmatch(
        r"(?P<name>[A-Za-z0-9_.-]+)=(?P<current>[0-9]+):(?P<next>[0-9]+)",
        value,
    )
    if not match:
        raise argparse.ArgumentTypeError(
            "switch must use NAME=CURRENT_PORT:NEXT_PORT"
        )
    name = match.group("name")
    current = match.group("current")
    next_port = match.group("next")
    for port, label in ((current, "current"), (next_port, "next")):
        if not 1 <= int(port) <= 65535:
            raise argparse.ArgumentTypeError(f"invalid {label} port: {port}")
    if current == next_port:
        raise argparse.ArgumentTypeError("current and next ports must differ")
    return name, current, next_port


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=None)
    parser.add_argument(
        "--switch",
        action="append",
        type=parse_switch,
        default=[],
        help="repeatable NAME=CURRENT_PORT:NEXT_PORT transaction entry",
    )
    parser.add_argument(
        "--file-switch",
        action="append",
        type=parse_file_switch,
        default=[],
        help="repeatable PATH=NAME=CURRENT_PORT:NEXT_PORT entry; all files commit together",
    )
    parser.add_argument(
        "--backup",
        action="append",
        type=parse_backup,
        default=[],
        help="repeatable NAME=PRIMARY_PORT:BACKUP_PORT entry on --file",
    )
    parser.add_argument(
        "--file-backup",
        action="append",
        type=parse_file_backup,
        default=[],
        help="repeatable PATH=NAME=PRIMARY_PORT:BACKUP_PORT entry; all files commit together",
    )
    parser.add_argument("--upstream", default="")
    parser.add_argument("--current-port", default="")
    parser.add_argument("--next-port", default="")
    parser.add_argument(
        "--health-url",
        action="append",
        default=[],
        help="repeatable URL that must return HTTP 200 after reload",
    )
    parser.add_argument("--nginx-bin", default="nginx")
    parser.add_argument("--nginx-test-command", default="")
    parser.add_argument("--reload-command", default="systemctl reload nginx")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    legacy_values = (args.upstream, args.current_port, args.next_port)
    explicit_modes = sum(
        bool(value) for value in (args.switch, args.file_switch, args.backup, args.file_backup)
    )
    if explicit_modes > 1:
        raise SystemExit("transaction modes cannot be combined")
    if args.file and explicit_modes + bool(any(legacy_values)) != 1:
        raise SystemExit("provide exactly one transaction mode")

    switches = list(args.switch)
    if any(legacy_values):
        if not all(legacy_values):
            raise SystemExit(
                "--upstream, --current-port, and --next-port must be provided together"
            )
        switches.append(parse_switch(f"{args.upstream}={args.current_port}:{args.next_port}"))
    if args.file_backup:
        file_backups = args.file_backup
    elif args.backup:
        if not args.file:
            raise SystemExit("--backup requires --file")
        file_backups = []
    elif args.file_switch:
        if switches or args.file:
            raise SystemExit("--file-switch cannot be combined with --file or --switch")
    elif args.file and (args.switch or any(legacy_values)):
        if not switches:
            raise SystemExit("provide at least one --switch NAME=CURRENT_PORT:NEXT_PORT")
        file_switches = [(args.file, switch) for switch in switches]
    else:
        raise SystemExit("provide --file with --switch, or one or more --file-switch entries")
    if not args.health_url:
        raise SystemExit("provide at least one --health-url")

    try:
        if args.backup:
            entries = build_backup_transaction([(args.file, backup) for backup in args.backup])
            effective_switches = args.backup
        elif args.file_backup:
            entries = build_backup_transaction(args.file_backup)
            effective_switches = [backup for _path, backup in args.file_backup]
        elif args.file_switch:
            entries = build_file_transaction(args.file_switch)
            effective_switches = [switch for _path, switch in args.file_switch]
        else:
            source = args.file.read_text(encoding="utf-8")
            updated = switch_upstreams_text(source, switches)
            entries = [(str(args.file), args.file, source, args.file.stat().st_mode & 0o777, updated)]
            effective_switches = switches
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
    backup_mode = bool(args.backup or args.file_backup)
    for name, current, next_port in effective_switches:
        if backup_mode:
            print(f"UPSTREAM_BACKUP_PLAN upstream={name} primary={current} backup={next_port}")
        else:
            print(
                f"UPSTREAM_SWITCH_PLAN upstream={name} from={current} to={next_port}"
            )
    for path_text, _path, original, _mode, updated in entries:
        if original != updated:
            print(f"UPSTREAM_SWITCH_FILE path={path_text} changed=1")
    if not args.apply:
        return 0

    test_command = shlex.split(args.nginx_test_command or f"{args.nginx_bin} -t")
    reload_command = shlex.split(args.reload_command)
    if not test_command or not reload_command:
        raise SystemExit("reload-command must not be empty")
    lock = acquire_transaction_lock()
    journal: Path | None = None
    committed = False
    restored_after_failure = False
    try:
        recover_stale_journal()
        journal = write_journal(entries)
        for _path_text, path, _original, mode, updated in entries:
            atomic_write(path, updated, mode)
        run(test_command)
        run(reload_command)
        for health_url in args.health_url:
            require_http_200(health_url)
        committed = True
    except Exception:
        if journal is not None:
            try:
                restored = restore_journal(journal)
                restored_after_failure = True
                print(f"UPSTREAM_SWITCH_ROLLBACK files={len(restored)}")
            except Exception as rollback_error:
                print(
                    f"UPSTREAM_SWITCH_ROLLBACK_FAILED error={rollback_error}; journal={journal}",
                    file=sys.stderr,
                )
        try:
            run(test_command)
            run(reload_command)
        except Exception:
            pass
        raise
    finally:
        if journal is not None and (committed or restored_after_failure):
            journal.unlink(missing_ok=True)
        lock.close()
    for name, _, next_port in effective_switches:
        if backup_mode:
            print(f"UPSTREAM_BACKUP_OK upstream={name} backup={next_port}")
        else:
            print(f"UPSTREAM_SWITCH_OK upstream={name} port={next_port}")
    print(
        f"UPSTREAM_SWITCH_COMMIT_OK upstreams={len(effective_switches)} "
        f"files={len(entries)} health_urls={len(args.health_url)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
