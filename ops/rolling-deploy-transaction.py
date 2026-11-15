#!/usr/bin/env python3
"""Orchestrate an Old-only dual-unit rolling deployment without partial traffic.

Safety properties:
- dry-run is the default; every mutating phase requires --apply;
- the current active upstream is discovered, never assumed to be 4174;
- the candidate process is restarted and verified before traffic moves;
- the loaded release commit, PID, and disabled worker flags must match exactly;
- an already-running stale process is never accepted merely because health is green;
- migrations/hooks run before any Nginx transaction;
- all traffic upstreams switch in one journaled Nginx transaction;
- failures after cutover restore the discovered original upstream;
- POST is never retried by this orchestrator;
- missing/invalid/inconsistent RUNTIME_MEDIA_ROOT fails before startup.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
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
UPSTREAM_RE = re.compile(
    r"upstream\s+(?P<name>[A-Za-z0-9_.-]+)\s*\{(?P<body>.*?)\}",
    __import__("re").S,
)
SERVER_RE = re.compile(r"(?<![A-Za-z0-9_])server\s+([^;{}]+);")
LOCAL_MEMBER_RE = re.compile(
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


def release_identity(release: Path) -> str:
    marker_path = release / "RELEASE_COMMIT"
    marker_identity = ""
    if marker_path.exists() or marker_path.is_symlink():
        if release.is_symlink() or marker_path.is_symlink() or not marker_path.is_file():
            raise TransactionError(f"release marker is not a regular file: {marker_path}")
        try:
            marker_identity = marker_path.read_text(encoding="utf-8").strip().lower()
        except OSError as error:
            raise TransactionError(f"cannot read release marker: {marker_path}: {error}") from error
        if not re.fullmatch(r"[0-9a-f]{40}(?:[0-9a-f]{24})?", marker_identity):
            raise TransactionError(f"release marker returned an invalid commit: {marker_identity!r}")
    if not (release / ".git").exists():
        if marker_identity:
            return marker_identity
        raise TransactionError(f"release checkout has neither Git metadata nor a release marker: {release}")
    identity = run(
        ["git", "-C", str(release), "rev-parse", "--verify", "HEAD"],
        timeout=15,
    ).lower()
    if not re.fullmatch(r"[0-9a-f]{40}(?:[0-9a-f]{24})?", identity):
        raise TransactionError(f"release checkout returned an invalid commit: {identity!r}")
    if marker_identity and marker_identity != identity:
        raise TransactionError(
            f"release marker {marker_identity} does not match Git checkout {identity}"
        )
    dirty = run(
        [
            "git", "-C", str(release), "status", "--porcelain=v1",
            "--untracked-files=no", "--ignore-submodules=dirty",
        ],
        timeout=15,
    )
    if dirty:
        raise TransactionError("release checkout is dirty; publish an immutable committed release first")
    return identity


def fetch_json(url: str, curl_bin: str = "curl", timeout: int = 15) -> dict:
    try:
        completed = subprocess.run(
            [
                curl_bin, "-sS", "--max-time", "10",
                "--write-out", "\n%{http_code}", url,
            ],
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        raise TransactionError(f"HTTP identity check timed out: {url}") from error
    body, separator, status_text = completed.stdout.rpartition("\n")
    if completed.returncode != 0 or not separator:
        detail = (completed.stderr or completed.stdout).strip()
        raise TransactionError(f"HTTP identity check failed: {url}: {detail}")
    try:
        status = int(status_text.strip())
    except ValueError as error:
        raise TransactionError(f"HTTP identity check returned no status: {url}") from error
    if status != 200:
        raise TransactionError(f"HTTP identity check returned {status}: {url}")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise TransactionError(f"HTTP identity check returned invalid JSON: {url}") from error
    if not isinstance(payload, dict):
        raise TransactionError(f"HTTP identity check returned a non-object: {url}")
    return payload


def validate_loaded_candidate(
    livez: dict,
    readyz: dict,
    *,
    expected_release: str,
    expected_pid: int,
    require_workers_disabled: bool,
) -> None:
    if livez.get("ok") is not True or readyz.get("ok") is not True or readyz.get("ready") is not True:
        raise TransactionError(f"candidate is not ready: livez={livez} readyz={readyz}")
    for label, payload in (("livez", livez), ("readyz", readyz)):
        release = payload.get("release")
        if not isinstance(release, dict):
            raise TransactionError(
                f"candidate {label} has no loaded release identity; it is stale or predates the release gate"
            )
        if release.get("clean") is not True or release.get("source") not in {"git", "marker"}:
            raise TransactionError(f"candidate {label} release is not a clean Git checkout or immutable marker: {release}")
        if release.get("id") != expected_release:
            raise TransactionError(
                f"candidate {label} release={release.get('id')} expected={expected_release}"
            )
        process_info = payload.get("process")
        if not isinstance(process_info, dict) or process_info.get("pid") != expected_pid:
            raise TransactionError(
                f"candidate {label} pid={process_info} expected={expected_pid}"
            )
    if require_workers_disabled:
        runtime = readyz.get("runtime")
        required = (
            "backgroundSchedulers",
            "generationSubmitQueue",
            "generationSubmitWorker",
        )
        if not isinstance(runtime, dict) or any(runtime.get(key) is not False for key in required):
            raise TransactionError(
                f"candidate background work must be disabled during validation: {runtime}"
            )


def wait_loaded_candidate(
    base: str,
    *,
    expected_release: str,
    expected_pid: int,
    require_workers_disabled: bool,
    attempts: int,
    delay: float,
    curl_bin: str,
) -> None:
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            livez = fetch_json(candidate_health_url(base, "livez"), curl_bin)
            readyz = fetch_json(candidate_health_url(base, "readyz"), curl_bin)
            validate_loaded_candidate(
                livez,
                readyz,
                expected_release=expected_release,
                expected_pid=expected_pid,
                require_workers_disabled=require_workers_disabled,
            )
            return
        except TransactionError as error:
            last_error = error
        time.sleep(delay)
    raise TransactionError(f"candidate identity check failed: {last_error}")


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


def canary_command(
    *,
    python: str,
    switch_script: Path,
    files: list[Path],
    names: tuple[str, ...],
    primary: str,
    candidate: str,
    primary_weight: int,
    candidate_weight: int,
    health_urls: list[str],
    nginx_bin: str,
    reload_command: str,
) -> list[str]:
    command = [python, str(switch_script)]
    for path, name in zip(files, names):
        command.extend([
            "--file-canary",
            f"{path}={name}={primary}:{candidate}:{primary_weight}:{candidate_weight}",
        ])
    for url in health_urls:
        command.extend(["--health-url", url])
    command.extend(["--nginx-bin", nginx_bin, "--reload-command", reload_command])
    return command


def execute_canary(
    *,
    apply: bool,
    python: str,
    switch_script: Path,
    files: list[Path],
    names: tuple[str, ...],
    primary: str,
    candidate: str,
    primary_weight: int,
    candidate_weight: int,
    health_urls: list[str],
    nginx_bin: str,
    reload_command: str,
    env: dict[str, str],
) -> None:
    command = canary_command(
        python=python,
        switch_script=switch_script,
        files=files,
        names=names,
        primary=primary,
        candidate=candidate,
        primary_weight=primary_weight,
        candidate_weight=candidate_weight,
        health_urls=health_urls,
        nginx_bin=nginx_bin,
        reload_command=reload_command,
    )
    if not apply:
        log(
            f"PLAN canary_weights={primary_weight}:{candidate_weight} "
            f"primary={primary} candidate={candidate} files={len(files)}"
        )
        run(command, env=env, timeout=60)
        return
    run([*command, "--apply"], env=env, timeout=90)
    log(f"DONE canary_weights={primary_weight}:{candidate_weight}")


def observe_canary(
    args: argparse.Namespace,
    *,
    expected_release: str,
    candidate_pid: int,
    initial_restarts: str,
    percent: int,
) -> None:
    deadline = time.monotonic() + args.canary_observe_seconds
    polls = 0
    while True:
        service = systemctl_show(
            args.candidate_service,
            "ActiveState,SubState,MainPID,NRestarts",
            args.systemctl,
        )
        if service.get("ActiveState") != "active" or service.get("SubState") != "running":
            raise TransactionError(f"candidate service stopped during {percent}% canary: {service}")
        if service.get("MainPID") != str(candidate_pid):
            raise TransactionError(
                f"candidate PID changed during {percent}% canary: "
                f"expected={candidate_pid} observed={service.get('MainPID')}"
            )
        observed_restarts = service.get("NRestarts", "0")
        if observed_restarts != initial_restarts:
            raise TransactionError(
                f"candidate restarted during {percent}% canary: "
                f"expected={initial_restarts} observed={observed_restarts}"
            )
        livez = fetch_json(candidate_health_url(args.candidate_health_base, "livez"), args.curl_bin)
        readyz = fetch_json(candidate_health_url(args.candidate_health_base, "readyz"), args.curl_bin)
        validate_loaded_candidate(
            livez,
            readyz,
            expected_release=expected_release,
            expected_pid=candidate_pid,
            require_workers_disabled=True,
        )
        for url in args.health_url:
            if not http_ok(url, args.curl_bin):
                raise TransactionError(f"public health failed during {percent}% canary: {url}")
        for path in args.candidate_smoke_path:
            url = f"{args.candidate_health_base.rstrip('/')}/{path.lstrip('/')}"
            if not http_ok(url, args.curl_bin):
                raise TransactionError(f"candidate smoke failed during {percent}% canary: {url}")
        polls += 1
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(max(0.05, args.canary_poll_seconds), remaining))
    log(f"CANARY_OBSERVE_OK percent={percent} polls={polls}")


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
    checked_out_release = release_identity(release)
    expected_release = args.expected_release_id or checked_out_release
    if not re.fullmatch(r"[0-9a-f]{40}(?:[0-9a-f]{24})?", expected_release):
        raise TransactionError("--expected-release-id must be a full 40- or 64-character Git commit")
    if expected_release != checked_out_release:
        raise TransactionError(
            f"expected release={expected_release} does not match checkout={checked_out_release}"
        )
    before_hashes = nginx_snapshot(files)
    original_port = discover_active_port(files, names, args.primary_port, args.candidate_port)
    log(
        f"OBSERVED active_port={original_port} release={expected_release} "
        f"runtime_media={runtime_root} files={len(files)}"
    )

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
        log("PLAN phase=restart_candidate")
        service_action(args.systemctl, "restart", args.candidate_service, apply=False)
        log(f"PLAN phase=verify_loaded_release id={expected_release} workers_disabled=true")
        if args.canary_percent:
            canary_percents = list(dict.fromkeys([
                args.canary_percent,
                args.canary_second_percent,
            ]))
            for percent in canary_percents:
                command = canary_command(
                    python=args.python,
                    switch_script=switch_script,
                    files=files,
                    names=names,
                    primary=original_port,
                    candidate=preview_target,
                    primary_weight=100 - percent,
                    candidate_weight=percent,
                    health_urls=args.health_url,
                    nginx_bin=args.nginx_bin,
                    reload_command=args.reload_command,
                )
                run(command, env=combined_env, timeout=60)
                log(
                    f"PLAN phase=canary percent={percent} "
                    f"observe_seconds={args.canary_observe_seconds:g} "
                    f"poll_seconds={args.canary_poll_seconds:g}"
                )
            log("PLAN phase=canary_restore weights=100:0")
        log("PLAN phase=cutover")
        log(f"PLAN upstream_switch={original_port}->{preview_target} files={len(files)}")
        log("PLAN phase=post_cutover_hooks")
        run_commands(args.post_cutover_command, apply=False, env=combined_env)
        log("PLAN phase=verify")
        if nginx_snapshot(files) != before_hashes:
            raise TransactionError("dry-run changed an Nginx file")
        return 0

    candidate_started = False
    cutover = False
    canary_active = False
    current = original_port
    target = args.candidate_port if original_port == args.primary_port else args.primary_port
    try:
        run([args.python, "-m", "py_compile", str(switch_script)], env=combined_env, timeout=30)
        if original_port == args.candidate_port:
            # A previous attempt may already have completed the cutover. Treat
            # this as a verified recovery-state no-op, never a reverse switch.
            candidate_pid = int(require_active(args.candidate_service, args.systemctl))
            wait_loaded_candidate(
                args.candidate_health_base,
                expected_release=expected_release,
                expected_pid=candidate_pid,
                require_workers_disabled=False,
                attempts=args.wait_attempts,
                delay=args.wait_delay,
                curl_bin=args.curl_bin,
            )
            for endpoint in ("livez", "health", "readyz"):
                wait_http_200(candidate_health_url(args.candidate_health_base, endpoint), args.wait_attempts, args.wait_delay, args.curl_bin)
            for url in args.health_url:
                wait_http_200(url, args.wait_attempts, args.wait_delay, args.curl_bin)
            log(f"ROLLING_DEPLOY_NOOP active_port={original_port} reason=already-active")
            return 0
        log(f"PHASE preflight original={original_port} target={target}")
        require_active(args.primary_service, args.systemctl)
        run_commands(args.migrate_command, apply=True, env=combined_env)

        log("PHASE restart_candidate")
        candidate_started = True
        service_action(args.systemctl, "restart", args.candidate_service, apply=True)
        candidate_pid = int(require_active(args.candidate_service, args.systemctl))
        for endpoint in ("livez", "health", "readyz"):
            wait_http_200(candidate_health_url(args.candidate_health_base, endpoint), args.wait_attempts, args.wait_delay, args.curl_bin)
        wait_loaded_candidate(
            args.candidate_health_base,
            expected_release=expected_release,
            expected_pid=candidate_pid,
            require_workers_disabled=True,
            attempts=args.wait_attempts,
            delay=args.wait_delay,
            curl_bin=args.curl_bin,
        )
        log("PHASE candidate_ready")

        if args.canary_percent:
            candidate_state = systemctl_show(
                args.candidate_service,
                "NRestarts",
                args.systemctl,
            )
            initial_restarts = candidate_state.get("NRestarts", "0")
            canary_percents = list(dict.fromkeys([
                args.canary_percent,
                args.canary_second_percent,
            ]))
            for percent in canary_percents:
                log(f"PHASE canary percent={percent}")
                execute_canary(
                    apply=True,
                    python=args.python,
                    switch_script=switch_script,
                    files=files,
                    names=names,
                    primary=current,
                    candidate=target,
                    primary_weight=100 - percent,
                    candidate_weight=percent,
                    health_urls=args.health_url,
                    nginx_bin=args.nginx_bin,
                    reload_command=args.reload_command,
                    env=combined_env,
                )
                canary_active = True
                observe_canary(
                    args,
                    expected_release=expected_release,
                    candidate_pid=candidate_pid,
                    initial_restarts=initial_restarts,
                    percent=percent,
                )
            log("PHASE canary_restore weights=100:0")
            execute_canary(
                apply=True,
                python=args.python,
                switch_script=switch_script,
                files=files,
                names=names,
                primary=current,
                candidate=target,
                primary_weight=100,
                candidate_weight=0,
                health_urls=args.health_url,
                nginx_bin=args.nginx_bin,
                reload_command=args.reload_command,
                env=combined_env,
            )
            canary_active = False
            observed = discover_active_port(files, names, args.primary_port, args.candidate_port)
            if observed != current:
                raise TransactionError(
                    f"canary restore observed={observed} expected={current}"
                )

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
        log("PHASE post_cutover_hooks")
        run_commands(args.post_cutover_command, apply=True, env=combined_env)
        log("ROLLING_DEPLOY_OK")
        return 0
    except Exception as error:
        log(f"ROLLING_DEPLOY_FAILED phase={error}")
        if canary_active:
            try:
                execute_canary(
                    apply=True,
                    python=args.python,
                    switch_script=switch_script,
                    files=files,
                    names=names,
                    primary=current,
                    candidate=target,
                    primary_weight=100,
                    candidate_weight=0,
                    health_urls=args.health_url,
                    nginx_bin=args.nginx_bin,
                    reload_command=args.reload_command,
                    env=combined_env,
                )
                observed = discover_active_port(files, names, args.primary_port, args.candidate_port)
                if observed != current:
                    raise TransactionError(
                        f"canary rollback observed={observed} expected={current}"
                    )
                canary_active = False
                log(f"CANARY_ROLLBACK_OK upstream={current}")
            except Exception as rollback_error:
                log(f"CANARY_ROLLBACK_FAILED upstream={current} error={rollback_error}")
                raise TransactionError(
                    f"canary deploy failed and weighted traffic rollback failed: {error}; "
                    f"manual intervention required, original={current}"
                ) from error
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
    parser.add_argument(
        "--expected-release-id",
        default="",
        help="full Git commit expected in the loaded candidate process; defaults to the release checkout HEAD",
    )
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
    parser.add_argument(
        "--post-cutover-command",
        action="append",
        default=[],
        help="Run after the new upstream is healthy; any failure rolls traffic back.",
    )
    parser.add_argument(
        "--canary-percent",
        type=int,
        default=1,
        help="first weighted canary percentage; defaults to 1, 0 preserves the old immediate cutover",
    )
    parser.add_argument(
        "--canary-second-percent",
        type=int,
        default=5,
        help="second weighted canary percentage after the first gate passes",
    )
    parser.add_argument("--canary-observe-seconds", type=float, default=120.0)
    parser.add_argument("--canary-poll-seconds", type=float, default=5.0)
    parser.add_argument(
        "--candidate-smoke-path",
        action="append",
        default=[],
        help="read-only path queried directly on the candidate during every canary poll",
    )
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
    if not args.candidate_smoke_path:
        args.candidate_smoke_path = [
            "/",
            "/api/config/public",
            "/api/platform/playflux-templates",
        ]
    if not 0 <= args.canary_percent <= 50:
        parser.error("--canary-percent must be between 0 and 50")
    if not args.canary_percent <= args.canary_second_percent <= 50:
        parser.error("--canary-second-percent must be between --canary-percent and 50")
    if args.canary_observe_seconds <= 0:
        parser.error("--canary-observe-seconds must be positive")
    if args.canary_poll_seconds <= 0:
        parser.error("--canary-poll-seconds must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    try:
        return rollout(parse_args(argv or sys.argv[1:]))
    except TransactionError as error:
        print(f"ERROR {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
