#!/usr/bin/env python3
"""Read-only acceptance checks for the Old dual-instance cutover.

The verifier never edits Nginx, systemd, PostgreSQL, or application state. It
only inspects process ownership/listeners and issues bounded HTTP/SQL reads,
then prints machine-readable PASS/FAIL lines and exits non-zero on failure.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


PRIMARY_SERVICE = "raising-game-demo.service"
SECONDARY_SERVICE = "raising-game-demo-b.service"
PRIMARY_PORT = 4174
SECONDARY_PORT = 4175
PUBLIC_URLS = (
    "https://123vips.com/",
    "https://123vips.com/api/health",
    "https://123vips.com/api/livez",
    "https://123vips.com/api/readyz",
    "https://chat.5vips.com/api/health",
    "https://live.123vipeak.com/api/health",
)
LOCAL_PATHS = ("/api/health", "/api/livez", "/api/readyz")


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def run(command: list[str], timeout: int = 15) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def systemctl_show(service: str, properties: tuple[str, ...]) -> dict[str, str]:
    command = ["systemctl", "show", service, "--no-pager"]
    for prop in properties:
        command.extend(["-p", prop])
    result = run(command)
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key] = value
    return values


def listening_pid(port: int) -> tuple[bool, str]:
    result = run(["ss", "-ltnp", f"sport = :{port}"])
    match_lines = [line for line in result.stdout.splitlines() if "LISTEN" in line]
    if not match_lines:
        return False, "not listening"
    return True, match_lines[0].strip()


def http_status(url: str, timeout: int = 10) -> tuple[int | None, float, str]:
    result = run(
        [
            "curl",
            "-sS",
            "-o",
            "/dev/null",
            "--max-time",
            str(timeout),
            "--write-out",
            "%{http_code} %{time_total}",
            url,
        ],
        timeout=timeout + 5,
    )
    status_text = result.stdout.strip().split()
    try:
        status = int(status_text[0])
    except (IndexError, ValueError):
        status = None
    try:
        elapsed = float(status_text[1])
    except (IndexError, ValueError):
        elapsed = 0.0
    if result.returncode != 0:
        return status, elapsed, result.stderr.strip()
    return status, elapsed, ""


def add_http_checks(checks: list[Check], base: str, phase: str) -> None:
    for path in LOCAL_PATHS:
        status, elapsed, error = http_status(f"{base}{path}")
        checks.append(
            Check(
                f"{phase}:{path}",
                status == 200,
                f"http={status or 'none'} seconds={elapsed:.3f} {error}".strip(),
            )
        )


def add_public_checks(checks: list[Check], phase: str) -> None:
    for url in PUBLIC_URLS:
        status, elapsed, error = http_status(url)
        checks.append(
            Check(
                f"{phase}:{url}",
                status == 200,
                f"http={status or 'none'} seconds={elapsed:.3f} {error}".strip(),
            )
        )


SECONDARY_ENV = Path("/etc/raising-game-demo-b.env")
SERVICE_ENV = Path(os.environ.get("RAISING_GAME_SERVICE_ENV", "/etc/raising-game-demo.env"))


def read_env_file(path: Path) -> dict[str, str]:
    """Read a systemd EnvironmentFile without executing or printing secrets."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def secondary_environment_check(checks: list[Check], phase: str) -> None:
    """Validate the non-secret secondary overrides without executing the app."""
    required = {
        "PORT": "4175",
        "DB_SCHEMA_MIGRATION_MODE": "verify",
        "BACKGROUND_SCHEDULERS_ENABLED": "0",
        "GENERATION_SUBMIT_QUEUE_ENABLED": "0",
        "GENERATION_SUBMIT_WORKER_ENABLED": "0",
    }
    forbidden = ("DATABASE_URL", "SECRET", "TOKEN", "PASSWORD", "KEY")
    problems: list[str] = []
    if not SECONDARY_ENV.is_file():
        problems.append("missing env file")
    else:
        values = read_env_file(SECONDARY_ENV)
        for key, expected in required.items():
            actual = values.get(key)
            if actual != expected:
                problems.append(f"{key}={actual or '<missing>'} expected={expected}")
        for key in values:
            if any(fragment in key.upper() for fragment in forbidden):
                problems.append(f"forbidden key={key}")
    checks.append(
        Check(
            f"{phase}:secondary-environment",
            not problems,
            "; ".join(problems) if problems else "overrides=5/5 secrets=0",
        )
    )


def add_service_check(
    checks: list[Check], service: str, require_active: bool, phase: str
) -> dict[str, str]:
    values = systemctl_show(
        service,
        (
            "LoadState",
            "ActiveState",
            "SubState",
            "MainPID",
            "NRestarts",
            "ControlGroup",
        ),
    )
    active = values.get("ActiveState") == "active" and values.get("SubState") == "running"
    main_pid = values.get("MainPID", "0")
    ok = active if require_active else not active or main_pid == "0"
    checks.append(
        Check(
            f"{phase}:service:{service}",
            ok,
            f"active={values.get('ActiveState', '')} sub={values.get('SubState', '')} "
            f"pid={main_pid} restarts={values.get('NRestarts', '')}",
        )
    )
    return values


def database_checks(checks: list[Check], phase: str) -> None:
    database_url = os.environ.get("DATABASE_URL", "") or read_env_file(SERVICE_ENV).get("DATABASE_URL", "")
    if not database_url:
        checks.append(Check(f"{phase}:database", False, "DATABASE_URL is not set"))
        return
    sql = """
      SELECT
        current_setting('max_connections')::int AS max_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS active_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction')::int AS idle_in_transaction,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock')::int AS lock_waiting,
        (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database())::bigint AS deadlocks
    """
    result = run(["psql", database_url, "-X", "-A", "-t", "-F", "|", "-c", sql])
    if result.returncode != 0:
        checks.append(Check(f"{phase}:database", False, result.stderr.strip() or "psql failed"))
        return
    fields = result.stdout.strip().split("|")
    try:
        maximum, active, idle_tx, lock_waiting, deadlocks = [int(item) for item in fields]
    except (ValueError, TypeError):
        checks.append(Check(f"{phase}:database", False, f"unexpected psql output: {result.stdout.strip()}"))
        return
    utilization = active / maximum if maximum else 1.0
    ok = utilization < 0.70 and idle_tx == 0 and lock_waiting == 0
    checks.append(
        Check(
            f"{phase}:database",
            ok,
            f"connections={active}/{maximum} utilization={utilization:.2%} "
            f"idle_in_transaction={idle_tx} lock_waiting={lock_waiting} deadlocks={deadlocks}",
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--phase",
        choices=("candidate", "pre", "post", "rollback"),
        required=True,
        help="candidate checks the secondary before traffic; pre/post include public entries; rollback expects primary only.",
    )
    parser.add_argument("--candidate-port", type=int, default=SECONDARY_PORT)
    parser.add_argument("--primary-port", type=int, default=PRIMARY_PORT)
    args = parser.parse_args()

    for binary in ("systemctl", "ss", "curl", "psql"):
        if not shutil.which(binary):
            print(f"CUTOVER_CHECK_FAIL missing_binary={binary}", file=sys.stderr)
            return 2

    checks: list[Check] = []
    primary = add_service_check(checks, PRIMARY_SERVICE, True, args.phase)
    primary_pid = primary.get("MainPID", "0")
    primary_listening, primary_detail = listening_pid(args.primary_port)
    primary_ok = primary_listening and f"pid={primary_pid}" in primary_detail
    checks.append(
        Check(
            f"{args.phase}:primary-listener:{args.primary_port}",
            primary_ok,
            primary_detail,
        )
    )
    add_http_checks(checks, f"http://127.0.0.1:{args.primary_port}", f"{args.phase}:primary")

    if args.phase == "candidate":
        secondary_environment_check(checks, args.phase)
        secondary = add_service_check(checks, SECONDARY_SERVICE, True, args.phase)
        secondary_pid = secondary.get("MainPID", "0")
        secondary_listening, secondary_detail = listening_pid(args.candidate_port)
        secondary_ok = secondary_listening and f"pid={secondary_pid}" in secondary_detail
        checks.append(
            Check(
                f"{args.phase}:candidate-listener:{args.candidate_port}",
                secondary_ok,
                secondary_detail,
            )
        )
        checks.append(
            Check(
                f"{args.phase}:distinct-main-pids",
                bool(primary_pid not in {"", "0"} and secondary_pid not in {"", "0", primary_pid}),
                f"primary={primary_pid} secondary={secondary_pid}",
            )
        )
        add_http_checks(checks, f"http://127.0.0.1:{args.candidate_port}", f"{args.phase}:candidate")
    elif args.phase in {"pre", "post"}:
        add_public_checks(checks, args.phase)
    elif args.phase == "rollback":
        secondary = add_service_check(checks, SECONDARY_SERVICE, False, args.phase)
        secondary_listening, secondary_detail = listening_pid(args.candidate_port)
        checks.append(
            Check(
                f"{args.phase}:candidate-stopped",
                not secondary_listening and secondary.get("MainPID", "0") in {"", "0"},
                secondary_detail,
            )
        )
        add_public_checks(checks, args.phase)

    database_checks(checks, args.phase)

    failed = 0
    for check in checks:
        print(
            f"CUTOVER_CHECK {'PASS' if check.ok else 'FAIL'} "
            f"phase={args.phase} name={check.name} detail={json.dumps(check.detail)}"
        )
        if not check.ok:
            failed += 1
    print(
        f"CUTOVER_VERIFY_{'OK' if failed == 0 else 'FAILED'} "
        f"phase={args.phase} checks={len(checks)} failed={failed}"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
