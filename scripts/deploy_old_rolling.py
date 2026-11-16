#!/usr/bin/env python3
"""Prepare an immutable Old release and run the dual-unit rolling transaction.

This command runs on the Old host after deploy_pull has fetched a committed
platform release. It is dry-run by default. Apply mode only changes the
inactive unit first; traffic is handled by the canary transaction.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


DEFAULT_SOURCE_ROOT = Path("/opt/raising-game-release-src")
DEFAULT_RELEASES_ROOT = Path("/opt/raising-game-releases")
DEFAULT_SHARED_ASSETS = Path("/opt/raising-game-shared/assets")
DEFAULT_NODE_PATH = Path("/opt/raising-game-demo/node_modules")
DEFAULT_PRIMARY_SERVICE = "raising-game-demo.service"
DEFAULT_CANDIDATE_SERVICE = "raising-game-demo-b.service"
DEFAULT_PRIMARY_PORT = "4174"
DEFAULT_CANDIDATE_PORT = "4175"
DEFAULT_ENV_FILE = Path("/etc/raising-game-demo.env")
DEFAULT_NGINX_ENABLED_ROOT = Path("/etc/nginx/sites-enabled")
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
DEFAULT_HEALTH_URLS = (
    "https://123vips.com/api/health",
    "https://chat.5vips.com/api/health",
    "https://live.123vipeak.com/api/health",
)
COMMIT_RE = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
UPSTREAM_BLOCK_RE = re.compile(
    r"upstream\s+(?P<name>[A-Za-z0-9_.-]+)\s*\{(?P<body>.*?)\}",
    re.S,
)
SERVER_MEMBER_RE = re.compile(r"(?<![A-Za-z0-9_])server\s+([^;{}]+);")
LOCAL_MEMBER_RE = re.compile(r"^(?:127\.0\.0\.1|localhost):(?P<port>[0-9]+)(?:\s+.*)?$")
PROXY_UPSTREAM_RE = re.compile(r"proxy_pass\s+http://(?P<name>[A-Za-z0-9_.-]+)")


class DeployError(RuntimeError):
    pass


def log(message: str) -> None:
    print(message, flush=True)


def run(command: list[str], *, timeout: int = 300) -> str:
    completed = subprocess.run(
        command,
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        if len(detail) > 4000:
            detail = detail[:4000] + "... [truncated]"
        raise DeployError(
            f"command failed ({completed.returncode}): {' '.join(shlex.quote(item) for item in command)}: {detail}"
        )
    return completed.stdout.strip()


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


def validate_shared_assets(path: Path) -> Path:
    if path.is_symlink():
        raise DeployError(f"shared runtime media must not be a symlink: {path}")
    if not path.is_dir():
        raise DeployError(f"shared runtime media must be an existing directory: {path}")
    return path.resolve()


def validate_runtime_media_env(env_file: Path, shared_assets: Path) -> None:
    env = read_env(env_file)
    configured = env.get("RUNTIME_MEDIA_ROOT", "").strip()
    if not configured:
        raise DeployError(f"RUNTIME_MEDIA_ROOT is required in {env_file} before rolling deployment")
    configured_path = Path(configured)
    if configured_path.is_symlink() or not configured_path.is_dir():
        raise DeployError(f"configured RUNTIME_MEDIA_ROOT is not a regular directory: {configured_path}")
    if configured_path.resolve() != shared_assets:
        raise DeployError(
            f"RUNTIME_MEDIA_ROOT mismatch: env={configured_path.resolve()} expected={shared_assets}"
        )


def release_marker(release: Path) -> str:
    marker = release / "RELEASE_COMMIT"
    if release.is_symlink() or marker.is_symlink() or not marker.is_file():
        raise DeployError(f"immutable release marker is missing or unsafe: {marker}")
    identity = marker.read_text(encoding="utf-8").strip().lower()
    if not COMMIT_RE.fullmatch(identity):
        raise DeployError(f"immutable release marker has an invalid commit: {identity!r}")
    return identity


def validate_upstream_coverage(
    enabled_root: Path,
    nginx_files: list[Path],
    upstream_names: list[str],
    primary_port: str,
    candidate_port: str,
) -> None:
    """Reject a release unless every referenced rolling upstream is in the transaction.

    Nginx can route real traffic through more than the upstreams named in the
    deployment target. Scanning only the files we intend to edit cannot detect
    a newly added site that still points at the primary port. This guard scans
    every enabled site and treats a referenced upstream containing either port
    as part of the production rolling surface.
    """
    if enabled_root.is_symlink() or not enabled_root.is_dir():
        raise DeployError(f"Nginx enabled root must be a regular directory: {enabled_root}")
    configured = tuple(str(path) for path in nginx_files)
    if len(configured) != len(set(configured)):
        raise DeployError("Nginx files in the rolling transaction must be unique")
    if len(upstream_names) != len(set(upstream_names)):
        raise DeployError("Nginx upstream names in the rolling transaction must be unique")

    texts: dict[Path, str] = {}
    for path in sorted(enabled_root.iterdir(), key=lambda item: item.name):
        if not path.is_file():
            continue
        try:
            texts[path] = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise DeployError(f"enabled Nginx file is not UTF-8 text: {path}") from error

    for path in nginx_files:
        if path.is_symlink() or not path.is_file():
            raise DeployError(f"Nginx file must be a regular file: {path}")
        if path.resolve() not in {item.resolve() for item in texts}:
            raise DeployError(f"Nginx file is not under the enabled root: {path}")

    members_by_name: dict[str, set[str]] = {}
    referenced: set[str] = set()
    for text in texts.values():
        referenced.update(match.group("name") for match in PROXY_UPSTREAM_RE.finditer(text))
        for match in UPSTREAM_BLOCK_RE.finditer(text):
            name = match.group("name")
            members = members_by_name.setdefault(name, set())
            for server in SERVER_MEMBER_RE.finditer(match.group("body")):
                member = LOCAL_MEMBER_RE.fullmatch(server.group(1).strip())
                if member:
                    members.add(member.group("port"))

    rolling_ports = {primary_port, candidate_port}
    referenced_rolling = {
        name for name in referenced
        if name in members_by_name and members_by_name[name] & rolling_ports
    }
    single_backend = sorted(
        name for name in referenced_rolling
        if not rolling_ports.issubset(members_by_name[name])
    )
    if single_backend:
        raise DeployError(
            "referenced Nginx upstreams are not dual-port rollover-capable: "
            + ", ".join(single_backend)
        )

    configured_names = set(upstream_names)
    missing = sorted(referenced_rolling - configured_names)
    if missing:
        raise DeployError(
            "referenced rolling upstreams are missing from the deployment transaction: "
            + ", ".join(missing)
        )
    not_rolling = sorted(configured_names - referenced_rolling)
    if not_rolling:
        raise DeployError(
            "configured upstreams are not referenced dual-port rolling upstreams: "
            + ", ".join(not_rolling)
        )


def validate_source_checkout(source_root: Path, commit: str) -> None:
    if source_root.is_symlink() or not source_root.is_dir():
        raise DeployError(f"release source checkout must be a regular directory: {source_root}")
    if not (source_root / ".git").exists():
        raise DeployError(f"release source checkout is not a Git checkout: {source_root}")
    observed = run(["git", "-C", str(source_root), "rev-parse", "--verify", "HEAD^{commit}"], timeout=15).lower()
    if observed != commit:
        raise DeployError(f"release source HEAD mismatch: observed={observed} expected={commit}")
    dirty = run(
        ["git", "-C", str(source_root), "status", "--porcelain=v1", "--untracked-files=no"],
        timeout=15,
    )
    if dirty:
        raise DeployError("release source checkout is dirty; fetch a clean committed release")


def target_for_active_port(
    active_port: str,
    *,
    primary_port: str,
    candidate_port: str,
    primary_service: str,
    candidate_service: str,
) -> tuple[str, str]:
    if active_port == primary_port:
        return candidate_port, candidate_service
    if active_port == candidate_port:
        return primary_port, primary_service
    raise DeployError(f"active upstream port is neither {primary_port} nor {candidate_port}: {active_port}")


def dropin_path(service: str) -> Path:
    unit = service if service.endswith(".service") else f"{service}.service"
    return Path(f"/etc/systemd/system/{unit}.d/89-release-root.conf")


def validate_node_path(path: Path) -> Path:
    if path.is_symlink() or not path.is_dir():
        raise DeployError(f"candidate Node dependency directory must be a regular directory: {path}")
    return path.resolve()


def validate_node_manifests(release_source: Path, node_path: Path) -> None:
    dependency_root = node_path.resolve().parent
    for name in ("package.json", "package-lock.json"):
        source_file = release_source / name
        installed_file = dependency_root / name
        for path in (source_file, installed_file):
            if path.is_symlink() or not path.is_file():
                raise DeployError(f"Node dependency manifest must be a regular file: {path}")
        if source_file.read_bytes() != installed_file.read_bytes():
            raise DeployError(
                f"Node dependency manifest mismatch: {source_file} != {installed_file}; "
                "use --node-path pointing at dependencies built for this release"
            )


def render_dropin(release: Path, node_path: Path) -> str:
    return (
        "[Service]\n"
        f"WorkingDirectory={release}\n"
        f"Environment=NODE_PATH={node_path}\n"
        "Environment=BACKGROUND_SCHEDULERS_ENABLED=0\n"
        "Environment=GENERATION_SUBMIT_QUEUE_ENABLED=0\n"
        "Environment=GENERATION_SUBMIT_WORKER_ENABLED=0\n"
    )


def verify_inactive_candidate(
    args: argparse.Namespace,
    rolling,
    *,
    candidate_service: str,
    candidate_port: str,
    release: Path,
) -> int:
    if candidate_service != args.candidate_service or candidate_port != args.candidate_port:
        raise DeployError("candidate-only verification refuses to target the active service or port")
    candidate_pid = int(rolling.require_active(candidate_service, "systemctl"))
    health_base = f"http://127.0.0.1:{candidate_port}"
    for endpoint in ("livez", "health", "readyz"):
        rolling.wait_http_200(
            rolling.candidate_health_url(health_base, endpoint),
            30,
            2.0,
            "curl",
        )
    for path in ("/", "/api/config/public", "/api/platform/playflux-templates"):
        rolling.wait_http_200(
            f"{health_base}{path}",
            30,
            2.0,
            "curl",
        )
    rolling.wait_loaded_candidate(
        health_base,
        expected_release=args.commit,
        expected_pid=candidate_pid,
        require_workers_disabled=True,
        attempts=30,
        delay=2.0,
        curl_bin="curl",
    )
    state = rolling.systemctl_show(
        candidate_service,
        "ActiveState,SubState,MainPID,NRestarts",
        "systemctl",
    )
    if state.get("ActiveState") != "active" or state.get("SubState") != "running":
        raise DeployError(f"candidate service is not active after verification: {state}")
    if state.get("MainPID") != str(candidate_pid):
        raise DeployError(
            f"candidate PID mismatch after verification: expected={candidate_pid} observed={state.get('MainPID')}"
        )
    log(
        f"OLD_CANDIDATE_READY release={args.commit} pid={candidate_pid} "
        f"service={candidate_service} port={candidate_port} restarts={state.get('NRestarts', '0')}"
    )
    return candidate_pid


def verify_primary_service_unchanged(rolling, *, service: str, expected_pid: int) -> None:
    state = rolling.systemctl_show(
        service,
        "ActiveState,SubState,MainPID,NRestarts",
        "systemctl",
    )
    if state.get("ActiveState") != "active" or state.get("SubState") != "running":
        raise DeployError(f"primary service is not active after candidate verification: {state}")
    if state.get("MainPID") != str(expected_pid):
        raise DeployError(
            "primary service PID changed during candidate-only verification: "
            f"expected={expected_pid} observed={state.get('MainPID')}"
        )
    log(
        f"OLD_PRIMARY_UNCHANGED service={service} pid={expected_pid} "
        f"restarts={state.get('NRestarts', '0')}"
    )


def verify_public_health_unchanged(args: argparse.Namespace, rolling) -> None:
    for url in args.health_url:
        rolling.wait_http_200(url, 30, 2.0, "curl")
    log(f"OLD_PUBLIC_HEALTH_UNCHANGED urls={len(args.health_url)}")


def activate_inactive_candidate(
    args: argparse.Namespace,
    rolling,
    *,
    candidate_service: str,
    candidate_port: str,
    release: Path,
    node_path: Path,
    destination: Path,
    previous_dropin: bytes | None,
) -> int:
    """Restart only the inactive candidate and restore it on any failed gate."""
    primary_pid = int(rolling.require_active(args.primary_service, "systemctl"))
    atomic_write(destination, render_dropin(release, node_path))
    try:
        run(["systemctl", "daemon-reload"], timeout=60)
        run(["systemctl", "restart", candidate_service], timeout=120)
        candidate_pid = verify_inactive_candidate(
            args,
            rolling,
            candidate_service=candidate_service,
            candidate_port=candidate_port,
            release=release,
        )
        verify_primary_service_unchanged(
            rolling,
            service=args.primary_service,
            expected_pid=primary_pid,
        )
        verify_public_health_unchanged(args, rolling)
    except Exception:
        if previous_dropin is None:
            destination.unlink(missing_ok=True)
        else:
            atomic_write(destination, previous_dropin.decode("utf-8"))
        try:
            run(["systemctl", "daemon-reload"], timeout=60)
            run(["systemctl", "restart", candidate_service], timeout=120)
            log("OLD_CANDIDATE_ROLLBACK_OK")
        except Exception as rollback_error:
            log(f"OLD_CANDIDATE_ROLLBACK_FAILED {rollback_error}")
        raise
    return candidate_pid


def atomic_write(path: Path, content: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = path.read_bytes() if path.is_file() else None
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary_path = Path(temporary)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        temporary_path.unlink(missing_ok=True)
        if previous is not None and not path.exists():
            path.write_bytes(previous)
        raise


def append_option(command: list[str], name: str, value: str) -> None:
    command.extend([name, value])


def expand_hook(template: str, release: Path, shared_assets: Path) -> str:
    return template.replace("__RELEASE__", str(release)).replace("__SHARED_ASSETS__", str(shared_assets))


def transaction_command(args: argparse.Namespace, release: Path, active_port: str) -> list[str]:
    shared_assets = Path(args.shared_assets).resolve()
    if active_port == args.primary_port:
        primary_service, primary_port = args.primary_service, args.primary_port
        candidate_service, candidate_port = args.candidate_service, args.candidate_port
    else:
        primary_service, primary_port = args.candidate_service, args.candidate_port
        candidate_service, candidate_port = args.primary_service, args.primary_port
    command = [
        args.python,
        str(release / "ops" / "rolling-deploy-transaction.py"),
        "--apply",
        "--release", str(release),
        "--primary-service", primary_service,
        "--candidate-service", candidate_service,
        "--primary-port", primary_port,
        "--candidate-port", candidate_port,
        "--env-file", str(args.env_file),
        "--switch-script", str(release / "ops" / "nginx-upstream-switch.py"),
        "--canary-percent", str(args.canary_percent),
        "--canary-second-percent", str(args.canary_second_percent),
        "--canary-observe-seconds", str(args.canary_observe_seconds),
        "--canary-poll-seconds", str(args.canary_poll_seconds),
    ]
    for path in args.nginx_file:
        append_option(command, "--nginx-file", str(path))
    for name in args.upstream_name:
        append_option(command, "--upstream-name", name)
    for url in args.health_url:
        append_option(command, "--health-url", url)
    for hook in args.migrate_command:
        append_option(command, "--migrate-command", expand_hook(hook, release, shared_assets))
    for hook in args.post_cutover_command:
        append_option(command, "--post-cutover-command", expand_hook(hook, release, shared_assets))
    log(f"PLAN active_port={active_port} release={release}")
    return command


def load_rolling_module(path: Path):
    spec = importlib.util.spec_from_file_location("old_rolling_transaction", path)
    if spec is None or spec.loader is None:
        raise DeployError(f"cannot load rolling transaction module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Safely deploy an immutable Old release with a canary gate.")
    parser.add_argument("--apply", action="store_true", help="prepare the release and run the rolling transaction")
    parser.add_argument(
        "--candidate-only",
        action="store_true",
        help="prepare and verify only the inactive candidate; never migrate, reload Nginx, or move traffic",
    )
    parser.add_argument("--commit", required=True, help="exact platform-release commit to deploy")
    parser.add_argument("--source-root", default=str(DEFAULT_SOURCE_ROOT))
    parser.add_argument("--releases-root", default=str(DEFAULT_RELEASES_ROOT))
    parser.add_argument("--shared-assets", default=str(DEFAULT_SHARED_ASSETS))
    parser.add_argument("--node-path", default=str(DEFAULT_NODE_PATH))
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--primary-service", default=DEFAULT_PRIMARY_SERVICE)
    parser.add_argument("--candidate-service", default=DEFAULT_CANDIDATE_SERVICE)
    parser.add_argument("--primary-port", default=DEFAULT_PRIMARY_PORT)
    parser.add_argument("--candidate-port", default=DEFAULT_CANDIDATE_PORT)
    parser.add_argument("--nginx-file", action="append", default=[])
    parser.add_argument("--upstream-name", action="append", default=[])
    parser.add_argument("--nginx-enabled-root", default=str(DEFAULT_NGINX_ENABLED_ROOT))
    parser.add_argument("--health-url", action="append", default=[])
    parser.add_argument("--migrate-command", action="append", default=[])
    parser.add_argument("--post-cutover-command", action="append", default=[])
    parser.add_argument("--canary-percent", type=int, default=1)
    parser.add_argument("--canary-second-percent", type=int, default=5)
    parser.add_argument("--canary-observe-seconds", type=float, default=120.0)
    parser.add_argument("--canary-poll-seconds", type=float, default=5.0)
    parser.add_argument("--python", default=sys.executable or "python3")
    args = parser.parse_args(argv)
    args.commit = args.commit.strip().lower()
    if not COMMIT_RE.fullmatch(args.commit):
        parser.error("--commit must be a full hexadecimal Git commit")
    args.nginx_file = [Path(item) for item in (args.nginx_file or DEFAULT_NGINX_FILES)]
    args.upstream_name = list(args.upstream_name or DEFAULT_UPSTREAM_NAMES)
    args.health_url = list(args.health_url or DEFAULT_HEALTH_URLS)
    if len(args.nginx_file) != len(args.upstream_name):
        parser.error("--nginx-file and --upstream-name counts must match")
    if args.canary_percent != 1 or args.canary_second_percent != 5:
        parser.error("Old production deployment requires the fixed 1% -> 5% canary")
    if args.canary_observe_seconds <= 0 or args.canary_poll_seconds <= 0:
        parser.error("canary observation durations must be positive")
    return args


def deploy(args: argparse.Namespace) -> int:
    source_root = Path(args.source_root).resolve()
    releases_root = Path(args.releases_root)
    shared_assets = validate_shared_assets(Path(args.shared_assets))
    node_path = validate_node_path(Path(args.node_path))
    env_file = Path(args.env_file)
    validate_runtime_media_env(env_file, shared_assets)
    validate_upstream_coverage(
        Path(args.nginx_enabled_root),
        args.nginx_file,
        args.upstream_name,
        args.primary_port,
        args.candidate_port,
    )
    validate_source_checkout(source_root, args.commit)
    validate_node_manifests(source_root, node_path)

    for path in args.nginx_file:
        if path.is_symlink() or not path.is_file():
            raise DeployError(f"Nginx file must be a regular file: {path}")

    rolling_path = source_root / "ops" / "rolling-deploy-transaction.py"
    rolling = load_rolling_module(rolling_path)
    active_port = rolling.discover_active_port(
        args.nginx_file,
        tuple(args.upstream_name),
        args.primary_port,
        args.candidate_port,
    )
    target_port, target_service = target_for_active_port(
        active_port,
        primary_port=args.primary_port,
        candidate_port=args.candidate_port,
        primary_service=args.primary_service,
        candidate_service=args.candidate_service,
    )
    if releases_root.is_symlink():
        raise DeployError(f"release root must not be a symlink: {releases_root}")
    release = releases_root / args.commit
    if release.exists() or release.is_symlink():
        if release_marker(release) != args.commit:
            raise DeployError(f"existing release marker does not match requested commit: {release}")
    else:
        log(f"PLAN prepare_release={release}")
        if args.apply:
            prepare = source_root / "ops" / "prepare-independent-release.sh"
            run([str(prepare), str(source_root), str(release), str(shared_assets)], timeout=300)
    marker = release_marker(release) if release.exists() else args.commit
    if marker != args.commit:
        raise DeployError(f"release marker mismatch: {marker} expected={args.commit}")

    destination = dropin_path(target_service)
    previous_dropin = destination.read_bytes() if destination.is_file() else None
    log(
        f"PLAN active_port={active_port} candidate_port={target_port} "
        f"candidate_service={target_service} release={release}"
    )
    if args.candidate_only:
        if target_service != args.candidate_service or target_port != args.candidate_port:
            raise DeployError("--candidate-only requires traffic to remain on the primary service/port")
        if not args.apply:
            log("OLD_CANDIDATE_ONLY_PLAN_OK")
            return 0
        activate_inactive_candidate(
            args,
            rolling,
            candidate_service=target_service,
            candidate_port=target_port,
            release=release,
            node_path=node_path,
            destination=destination,
            previous_dropin=previous_dropin,
        )
        log("OLD_CANDIDATE_ONLY_OK")
        return 0

    command = transaction_command(args, release, active_port)
    if not args.apply:
        log("OLD_ROLLING_DEPLOY_PLAN_OK")
        return 0

    atomic_write(destination, render_dropin(release, node_path))
    run(["systemctl", "daemon-reload"], timeout=60)
    try:
        output = run(command, timeout=max(900, int(args.canary_observe_seconds * 2 + 300)))
        print(output)
    except Exception:
        observed = rolling.discover_active_port(
            args.nginx_file,
            tuple(args.upstream_name),
            args.primary_port,
            args.candidate_port,
        )
        if observed == active_port:
            if previous_dropin is None:
                destination.unlink(missing_ok=True)
            else:
                atomic_write(destination, previous_dropin.decode("utf-8"))
            run(["systemctl", "daemon-reload"], timeout=60)
            log(f"OLD_ROLLING_DEPLOY_ROLLED_BACK active_port={observed}")
        else:
            log(
                f"OLD_ROLLING_DEPLOY_RECOVERY_UNKNOWN active_port={observed} "
                f"expected_for_rollback={active_port}; drop-in retained for manual recovery"
            )
        raise

    observed = rolling.discover_active_port(
        args.nginx_file,
        tuple(args.upstream_name),
        args.primary_port,
        args.candidate_port,
    )
    if observed != target_port:
        raise DeployError(f"post-deploy active port mismatch: observed={observed} expected={target_port}")
    log(f"OLD_ROLLING_DEPLOY_OK active_port={observed} release={args.commit}")
    return 0


def main(argv: list[str] | None = None) -> int:
    try:
        return deploy(parse_args(argv))
    except (DeployError, subprocess.TimeoutExpired) as error:
        print(f"OLD_ROLLING_DEPLOY_FAILED {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
