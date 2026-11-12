#!/usr/bin/env python3
"""Orchestrate an Old-only dual-unit rolling deployment without partial traffic.

Safety properties:
- dry-run is the default; every mutating phase requires --apply;
- the current active upstream is discovered, never assumed to be 4174;
- the candidate is started and verified before traffic moves;
- migrations/hooks run before any Nginx transaction;
- all traffic upstreams switch in one journaled Nginx transaction;
- failures after cutover restore the discovered original upstream;
- POST is never retried by this orchestrator;
- missing/invalid/inconsistent RUNTIME_MEDIA_ROOT fails before startup.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path


PRIMARY_PORT = "4174"
SECONDARY_PORT = "4175"
PRIMARY_SERVICE = "raising-game-demo.service"
SECONDARY_SERVICE = "raising-game-demo-b.service"
DEFAULT_PRIMARY_RELEASE = Path("/opt/raising-game-demo")
DEFAULT_RELEASE = Path("/opt/raising-game-demo")
DEFAULT_SERVICE_ENV = Path("/etc/raising-game-demo.env")
DEFAULT_NGINX_FILES = (
    Path("/etc/nginx/sites-enabled/default"),
    Path("/etc/nginx/sites-enabled/chat.5vips.com"),
    Path("/etc/nginx/sites-enabled/live.123vipeak.com"),
)
DEFAULT_UPSTREAM_NAMES = (
    "raising_game_app",
    "raising_game_app_chat",
    "raising_game_app_live",
)
UPSTREAM_RE = __import__("re").compile(
    r"upstream\s+(?P<name>[A-Za-z0-9_.-]+)\s*\{(?P<body>.*?)\}",
    __import__("re").S,
)
SERVER_RE = __import__("re").compile(r"(?<![A-Za-z0-9_])server\s+([^;{}]+);")
LOCAL_MEMBER_RE = __import__("re").compile(
    r"^(?:127\.0\.0\.1|localhost):(?P<port>[0-9]+)(?P<options>.*)$"
)


class TransactionError(RuntimeError):
    pass


def log(message: str) -> None:
    print(message, flush=True)


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def require_clean_path(label: str, path: Path, *, directory: bool = True) -> Path:
    if path.is_symlink():
        raise TransactionError(f"{label} must not be a symlink: {path}")
    if directory and not path.is_dir():
        raise TransactionError(f"{label} must be an existing directory: {path}")
    if not directory and not path.is_file():
        raise TransactionError(f"{label} must be an existing file: {path}")
    return path.resolve()


def validate_runtime_media(primary: Path, secondary: Path, env: dict[str, str]) -> Path:
    raw = env.get("RUNTIME_MEDIA_ROOT", "").strip()
    if not raw:
        raise TransactionError("RUNTIME_MEDIA_ROOT is required for rolling deploy")
    configured = Path(raw)
    try:
        root = require_clean_path("RUNTIME_MEDIA_ROOT", configured)
    except TransactionError:
        raise
    for label, release in (("primary", primary), ("candidate", secondary)):
        marker = release / "RUNTIME_MEDIA_ROOT"
        if not marker.is_file() or marker.is_symlink():
            raise TransactionError(f"{label} release is missing a regular RUNTIME_MEDIA_ROOT marker: {marker}")
        declared = marker.read_text(encoding="utf-8").strip()
        if not declared:
            raise TransactionError(f"{label} release has an empty RUNTIME_MEDIA_ROOT marker")
        try:
            declared_path = require_clean_path(f"{label} release runtime root", Path(declared))
        except TransactionError:
            raise
        if declared_path != root:
            raise TransactionError(
                f"RUNTIME_MEDIA_ROOT mismatch: env={root} {label}={declared_path}"
            )
    return root


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def nginx_snapshot(files: list[Path]) -> dict[str, str]:
    return {str(path): sha256(require_clean_path("Nginx file", path, directory=False)) for path in files}


def upstream_topology(
    files: list[Path], names: tuple[str, ...]
) -> dict[str, tuple[set[str], set[str]]]:
    found: dict[str, tuple[set[str], set[str]]] = {name: (set(), set()) for name in names}
    for path in files:
        text = path.read_text(encoding="utf-8")
        for match in UPSTREAM_RE.finditer(text):
            name = match.group("name")
            if name not in found:
                # Nginx files can contain unrelated upstream groups. They are
                # outside this transaction and must not make traffic discovery
                # brittle or broaden the set of files this tool may modify.
                continue
            active, members = found[name]
            for server in SERVER_RE.finditer(match.group("body")):
                member = LOCAL_MEMBER_RE.fullmatch(server.group(1).strip())
                if not member:
                    continue
                port = member.group("port")
                members.add(port)
                options = member.group("options").split()
                if "backup" not in options:
                    active.add(port)
    missing = [name for name, (_active, members) in found.items() if not members]
    if missing:
        raise TransactionError(f"missing upstream members: {', '.join(missing)}")
    return found


def discover_active_port(
    files: list[Path],
    names: tuple[str, ...],
    primary_port: str = PRIMARY_PORT,
    secondary_port: str = SECONDARY_PORT,
) -> str:
    topology = upstream_topology(files, names)
    member_sets = {frozenset(members) for _active, members in topology.values()}
    active_sets = {frozenset(active) for active, _members in topology.values()}
    if len(member_sets) != 1:
        raise TransactionError(f"all traffic upstreams must contain the same backend set: {topology}")
    if len(active_sets) != 1:
        raise TransactionError(f"all traffic upstreams must have one active backend: {topology}")
    active = next(iter(active_sets))
    if len(active) != 1:
        raise TransactionError(f"expected exactly one active backend: {topology}")
    active_port = next(iter(active))
    supported = {primary_port, secondary_port}
    if not set(next(iter(member_sets))).issubset(supported):
        raise TransactionError(f"unsupported upstream backend set: {topology}")
    return active_port


def run(command: list[str], *, env: dict[str, str] | None = None, timeout: int = 60) -> str:
    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=timeout,
            env={**os.environ, **(env or {})},
        )
    except subprocess.TimeoutExpired as error:
        raise TransactionError(f"command timed out: {' '.join(command)}") from error
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        if len(detail) > 2000:
            detail = detail[:2000] + "... [truncated]"
        raise TransactionError(f"command failed ({completed.returncode}): {' '.join(command)}: {detail}")
    return completed.stdout.strip()


def http_ok(url: str, curl_bin: str = "curl", timeout: int = 15) -> bool:
    try:
        completed = subprocess.run(
            [curl_bin, "-sS", "--max-time", "10", "--output", "/dev/null", "--write-out", "%{http_code}", url],
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    return completed.returncode == 0 and completed.stdout.strip() == "200"


def wait_http_200(url: str, attempts: int, delay: float, curl_bin: str = "curl") -> None:
    for _ in range(attempts):
        if http_ok(url, curl_bin):
            return
        time.sleep(delay)
    raise TransactionError(f"health check did not return 200: {url}")


def candidate_health_url(base: str, endpoint: str) -> str:
    return f"{base.rstrip('/')}/api/{endpoint}"


def systemctl_show(service: str, properties: str, systemctl: str = "systemctl") -> dict[str, str]:
    text = run([systemctl, "show", service, "-p", properties], timeout=15)
    result: dict[str, str] = {}
    for line in text.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key] = value
    return result


def require_active(service: str, systemctl: str = "systemctl") -> str:
    values = systemctl_show(service, "ActiveState,SubState,MainPID", systemctl)
    if values.get("ActiveState") != "active" or values.get("SubState") != "running" or values.get("MainPID", "0") == "0":
        raise TransactionError(f"{service} is not active/running: {values}")
    return values.get("MainPID", "")


def service_action(systemctl: str, action: str, service: str, *, apply: bool) -> None:
    if not apply:
        log(f"PLAN service={service} action={action}")
        return
    run([systemctl, action, service], timeout=330)
    log(f"DONE service={service} action={action}")


def switch_command(
    *,
    python: str,
    switch_script: Path,
    files: list[Path],
    names: tuple[str, ...],
    current: str,
    target: str,
    health_urls: list[str],
    nginx_bin: str,
    reload_command: str,
) -> list[str]:
    command = [python, str(switch_script)]
    for path, name in zip(files, names):
        command.extend(["--file-switch", f"{path}={name}={current}:{target}"])
    for url in health_urls:
        command.extend(["--health-url", url])
    command.extend(["--nginx-bin", nginx_bin, "--reload-command", reload_command])
    return command


def execute_switch(
    *,
    apply: bool,
    python: str,
    switch_script: Path,
    files: list[Path],
    names: tuple[str, ...],
    current: str,
    target: str,
    health_urls: list[str],
    nginx_bin: str,
    reload_command: str,
    env: dict[str, str],
) -> None:
    command = switch_command(
        python=python,
        switch_script=switch_script,
        files=files,
        names=names,
        current=current,
        target=target,
        health_urls=health_urls,
        nginx_bin=nginx_bin,
        reload_command=reload_command,
    )
    if not apply:
        log(f"PLAN upstream_switch={current}->{target} files={len(files)}")
        run(command, env=env, timeout=60)
        return
    run([*command, "--apply"], env=env, timeout=90)
    # The orchestrator verifies the complete topology after this function and
    # rolls it back through the same journaled transaction on any mismatch.
    log(f"DONE upstream_switch={target}")


def run_commands(commands: list[str], *, apply: bool, env: dict[str, str], timeout: int = 300) -> None:
    for index, command in enumerate(commands, 1):
        if not apply:
            log(f"PLAN hook={index} command={shlex.quote(command)}")
            continue
        run(["/bin/sh", "-c", command], env=env, timeout=timeout)
        log(f"DONE hook={index}")


def rollout(args: argparse.Namespace) -> int:
    files = [Path(value) for value in (args.nginx_file or DEFAULT_NGINX_FILES)]
    files = [require_clean_path("Nginx file", path, directory=False) for path in files]
    names = tuple(args.upstream_name or DEFAULT_UPSTREAM_NAMES)
    if len(files) != len(names):
        raise TransactionError("--nginx-file and --upstream-name counts must match")
    if len(names) != len(set(names)):
        raise TransactionError("upstream names must be unique")
    switch_script = require_clean_path("upstream switch script", Path(args.switch_script), directory=False)
    release = require_clean_path("release", Path(args.release))
    env_file = Path(args.env_file)
    service_env = read_env(env_file)
    combined_env = {**os.environ, **service_env}
    runtime_root = validate_runtime_media(release, release, combined_env)
    before_hashes = nginx_snapshot(files)
    original_port = discover_active_port(files, names, args.primary_port, args.candidate_port)
    log(f"OBSERVED active_port={original_port} runtime_media={runtime_root} files={len(files)}")

    if not args.apply:
        log("PLAN phase=preflight")
        command = [args.python, str(switch_script)]
        preview_target = args.candidate_port if original_port == args.primary_port else args.primary_port
        for path, name in zip(files, names):
            command.extend(["--file-switch", f"{path}={name}={original_port}:{preview_target}"])
        for url in args.health_url:
            command.extend(["--health-url", url])
        command.extend(["--nginx-bin", args.nginx_bin, "--reload-command", args.reload_command])
        run(command, env=combined_env, timeout=60)
        log("PLAN phase=migrate")
        run_commands(args.migrate_command, apply=False, env=combined_env)
        log("PLAN phase=start_candidate")
        service_action(args.systemctl, "start", args.candidate_service, apply=False)
        log("PLAN phase=cutover")
        log(f"PLAN upstream_switch={original_port}->{preview_target} files={len(files)}")
        log("PLAN phase=verify")
        if nginx_snapshot(files) != before_hashes:
            raise TransactionError("dry-run changed an Nginx file")
        return 0

    candidate_started = False
    cutover = False
    current = original_port
    target = args.candidate_port if original_port == args.primary_port else args.primary_port
    try:
        run([args.python, "-m", "py_compile", str(switch_script)], env=combined_env, timeout=30)
        if original_port == args.candidate_port:
            # A previous attempt may already have completed the cutover. Treat
            # this as a verified recovery-state no-op, never a reverse switch.
            require_active(args.candidate_service, args.systemctl)
            for endpoint in ("livez", "health", "readyz"):
                wait_http_200(candidate_health_url(args.candidate_health_base, endpoint), args.wait_attempts, args.wait_delay, args.curl_bin)
            for url in args.health_url:
                wait_http_200(url, args.wait_attempts, args.wait_delay, args.curl_bin)
            log(f"ROLLING_DEPLOY_NOOP active_port={original_port} reason=already-active")
            return 0
        log(f"PHASE preflight original={original_port} target={target}")
        require_active(args.primary_service, args.systemctl)
        run_commands(args.migrate_command, apply=True, env=combined_env)

        log("PHASE start_candidate")
        candidate_started = True
        service_action(args.systemctl, "start", args.candidate_service, apply=True)
        for endpoint in ("livez", "health", "readyz"):
            wait_http_200(candidate_health_url(args.candidate_health_base, endpoint), args.wait_attempts, args.wait_delay, args.curl_bin)
        log("PHASE candidate_ready")

        log(f"PHASE cutover={current}->{target}")
        execute_switch(
            apply=True,
            python=args.python,
            switch_script=switch_script,
            files=files,
            names=names,
            current=current,
            target=target,
            health_urls=args.health_url,
            nginx_bin=args.nginx_bin,
            reload_command=args.reload_command,
            env=combined_env,
        )
        cutover = True

        # Re-observe after reload. If two files landed on different primary
        # members, this fails and the complete original topology is restored.
        observed = discover_active_port(files, names, args.primary_port, args.candidate_port)
        if observed != target:
            raise TransactionError(f"cutover observed={observed} expected={target}")
        for url in args.health_url:
            wait_http_200(url, args.wait_attempts, args.wait_delay, args.curl_bin)
        log("ROLLING_DEPLOY_OK")
        return 0
    except Exception as error:
        log(f"ROLLING_DEPLOY_FAILED phase={error}")
        if cutover:
            try:
                execute_switch(
                    apply=True,
                    python=args.python,
                    switch_script=switch_script,
                    files=files,
                    names=names,
                    current=target,
                    target=current,
                    health_urls=args.health_url,
                    nginx_bin=args.nginx_bin,
                    reload_command=args.reload_command,
                    env=combined_env,
                )
                observed = discover_active_port(files, names, args.primary_port, args.candidate_port)
                if observed != current:
                    raise TransactionError(
                        f"rollback observed={observed} expected={current}"
                    )
                log(f"ROLLBACK_OK upstream={current}")
            except Exception as rollback_error:
                log(f"ROLLBACK_FAILED upstream={current} error={rollback_error}")
                raise TransactionError(
                    f"rolling deploy failed and traffic rollback failed: {error}; "
                    f"manual intervention required, original={current}"
                ) from error
        if candidate_started:
            try:
                service_action(args.systemctl, "stop", args.candidate_service, apply=True)
                log("CANDIDATE_STOP_OK")
            except Exception as stop_error:
                log(f"CANDIDATE_STOP_FAILED error={stop_error}")
        raise
    finally:
        after_hashes = nginx_snapshot(files)
        if after_hashes != before_hashes:
            log("NGINX_HASHES_CHANGED")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="execute mutations; without it, print the plan")
    parser.add_argument("--release", default=str(DEFAULT_RELEASE))
    parser.add_argument("--primary-service", default=PRIMARY_SERVICE)
    parser.add_argument("--candidate-service", default=SECONDARY_SERVICE)
    parser.add_argument("--primary-port", default=PRIMARY_PORT)
    parser.add_argument("--candidate-port", default=SECONDARY_PORT)
    parser.add_argument(
        "--candidate-health-base",
        default="",
        help="candidate HTTP origin (default: http://127.0.0.1:<candidate-port>)",
    )
    parser.add_argument("--env-file", default=str(DEFAULT_SERVICE_ENV))
    parser.add_argument("--nginx-file", action="append", default=[])
    parser.add_argument("--upstream-name", action="append", default=[])
    parser.add_argument("--switch-script", default=str(Path(__file__).with_name("nginx-upstream-switch.py")))
    parser.add_argument("--health-url", action="append", default=[])
    parser.add_argument("--migrate-command", action="append", default=[])
    parser.add_argument("--wait-attempts", type=int, default=30)
    parser.add_argument("--wait-delay", type=float, default=2.0)
    parser.add_argument("--nginx-bin", default="nginx")
    parser.add_argument("--reload-command", default="systemctl reload nginx")
    parser.add_argument("--systemctl", default="systemctl")
    parser.add_argument("--curl-bin", default="curl")
    parser.add_argument("--python", default=sys.executable or "python3")
    args = parser.parse_args(argv)
    if not args.candidate_health_base:
        args.candidate_health_base = f"http://127.0.0.1:{args.candidate_port}"
    if not args.health_url:
        args.health_url = [
            "https://123vips.com/api/health",
            "https://chat.5vips.com/api/health",
            "https://live.123vipeak.com/api/health",
        ]
    return args


def main(argv: list[str] | None = None) -> int:
    try:
        return rollout(parse_args(argv or sys.argv[1:]))
    except TransactionError as error:
        print(f"ERROR {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
