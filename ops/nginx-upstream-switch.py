#!/usr/bin/env python3
"""Atomically switch managed Nginx upstreams to verified replacements.

This script is deliberately narrow. It edits only single server directives
inside named upstream blocks whose current/next backends are explicitly
passed. Multiple upstreams are rendered in memory and written exactly once, so
a production cutover cannot expose a partially switched traffic mix. It never
restarts Node and never stops the old process; the caller drains old backends
only after every configured edge health check returns HTTP 200.
"""
from __future__ import annotations

import argparse
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


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

    rendered = text
    for start, end, replacement in sorted(edits, reverse=True):
        rendered = rendered[:start] + replacement + rendered[end:]
    return rendered


def switch_upstream_text(text: str, name: str, current: str, next_backend: str) -> str:
    return switch_upstreams_text(text, [(name, current, next_backend)])


def atomic_write(path: Path, value: str, mode: int) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
        os.chmod(temp_name, mode)
        os.replace(temp_name, path)
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
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument(
        "--switch",
        action="append",
        type=parse_switch,
        default=[],
        help="repeatable NAME=CURRENT_PORT:NEXT_PORT transaction entry",
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

    switches = list(args.switch)
    legacy_values = (args.upstream, args.current_port, args.next_port)
    if any(legacy_values):
        if not all(legacy_values):
            raise SystemExit(
                "--upstream, --current-port, and --next-port must be provided together"
            )
        switches.append(parse_switch(f"{args.upstream}={args.current_port}:{args.next_port}"))
    if not switches:
        raise SystemExit("provide at least one --switch NAME=CURRENT_PORT:NEXT_PORT")
    if not args.health_url:
        raise SystemExit("provide at least one --health-url")

    source = args.file.read_text(encoding="utf-8")
    updated = switch_upstreams_text(source, switches)
    for name, current, next_port in switches:
        print(
            f"UPSTREAM_SWITCH_PLAN upstream={name} from={current} to={next_port}"
        )
    if not args.apply:
        return 0

    original = source
    mode = args.file.stat().st_mode & 0o777
    test_command = shlex.split(args.nginx_test_command or f"{args.nginx_bin} -t")
    reload_command = shlex.split(args.reload_command)
    if not test_command or not reload_command:
        raise SystemExit("reload-command must not be empty")
    try:
        atomic_write(args.file, updated, mode)
        run(test_command)
        run(reload_command)
        for health_url in args.health_url:
            require_http_200(health_url)
    except Exception:
        atomic_write(args.file, original, mode)
        try:
            run(test_command)
            run(reload_command)
        except Exception:
            pass
        raise
    for name, _, next_port in switches:
        print(f"UPSTREAM_SWITCH_OK upstream={name} port={next_port}")
    print(f"UPSTREAM_SWITCH_COMMIT_OK upstreams={len(switches)} health_urls={len(args.health_url)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
