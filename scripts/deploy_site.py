#!/usr/bin/env python3
"""
Deploy a known production site by pulling the already-pushed Git branch.

This wrapper exists so production targets are not rediscovered ad hoc. It
does not copy files to the server; it delegates to deploy_pull.py with the
fixed branch, remote root, service, and health URL for each site.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


TARGETS = {
    "old": {
        "host": "47.84.76.131",
        "port": 22,
        "branch": "platform-release",
        "remote_root": "/opt/raising-game-demo",
        "runtime_root": "/opt/raising-game-demo",
        "service": "raising-game-demo",
        "health_url": "https://123vips.com/api/health",
        "verify_urls": (
            "https://123vips.com/",
            "https://123vips.com/live.html",
            "https://123vips.com/live.css",
            "https://123vips.com/live.js",
            "https://123vips.com/qrcode.js",
            "https://123vips.com/site-landing.html",
            "https://123vips.com/site-landing.css",
            "https://123vips.com/site-landing.js",
            "https://123vips.com/downloads/vipeak-live.apk",
        ),
        "verify_status": (
            "https://123vips.com/live.html=404",
            "https://123vips.com/live.css=404",
            "https://123vips.com/live.js=404",
            "https://123vips.com/qrcode.js=404",
            "https://123vips.com/site-landing.html=404",
            "https://123vips.com/site-landing.css=404",
            "https://123vips.com/site-landing.js=404",
            "https://123vips.com/downloads/vipeak-live.apk=404",
        ),
        "audit_base": "release-base/platform",
        "verify_contains": (
            "https://123vips.com/=platform.css",
            "https://123vips.com/=Vipeak AI",
        ),
        # A live-only UI change must not bleed into the platform surface.
        "verify_not_contains": (
            "https://123vips.com/=live.css",
            "https://123vips.com/=Vipeak Live",
        ),
        "env_file": "/etc/raising-game-demo.env",
        "required_file_counts": (("/opt/raising-game-demo/assets/ourdream/characters", 1000),),
        "password_env": ("OLD_SITE_SSH_PASSWORD", "FYSHARK_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
        "forbidden_changed_paths": (
            "live.html", "live.css", "live.js", "qrcode.js",
            "site-landing.*", "downloads/vipeak-live.apk", "mobile/live-android/**",
            "assets/brand/live-*", "assets/chat-live/moans/**",
            "assets/chat-live/welcome-newcomer*", "test/live-*.test.js",
            "verification/live-transaction/**",
        ),
        "forbidden_env_patterns": (
            r"^TOS_",
            r"^OSS_REGION=\"?oss-cn-",
            r"^OSS_ENDPOINT=\"?https?://[^/]*oss-cn-",
            r"^OSS_CDN_REGION=\"?oss-cn-",
            r"^OSS_CDN_BASE_URL=\"?https?://[^/]*(oss-cn-|aliyuncs\.com)",
        ),
        "required_env_patterns": (
            r"^R2_ACCESS_KEY_ID=.+$",
            r"^R2_SECRET_ACCESS_KEY=.+$",
            r"^R2_ENDPOINT=.+\.r2\.cloudflarestorage\.com/?\"?$",
            r"^R2_BUCKET=\"?vipeak-media\"?$",
            r"^R2_PUBLIC_BASE_URL=\"?https://media\.123vips\.com\"?$",
        ),
    },
    "live": {
        # Vipeak Live is a hostname-routed tenant on the same production
        # process as 123vips.com. Keep this as an explicit target so a live
        # release is never verified only through the platform domain.
        "host": "47.84.76.131",
        "port": 22,
        "branch": "live-release",
        "remote_root": "/opt/raising-game-live-src",
        "service": "raising-game-demo",
        "health_url": "https://live.123vipeak.com/api/health",
        "audit_base": "release-base/live",
        "requires_restart": False,
        "static_root": "/opt/raising-game-live-static",
        "pre_restart_commands": (
            "/usr/bin/python3 /opt/raising-game-demo/scripts/materialize_static_release.py --source /opt/raising-game-live-src --target /opt/raising-game-live-static --profile live",
        ),
        # Both domains share one process. Verify the live surface and confirm
        # the platform home page still serves its own assets after every live
        # release.
        "verify_urls": (
            "https://live.123vipeak.com/",
            "https://123vipeak.com/",
            "https://123vips.com/",
            "https://123vips.com/live.html",
        ),
        "verify_contains": (
            "https://live.123vipeak.com/=live.css",
            "https://live.123vipeak.com/=Vipeak Live",
            "https://123vipeak.com/=site-landing.css",
            "https://123vips.com/=platform.css",
            "https://123vips.com/=Vipeak AI",
        ),
        "verify_status": ("https://123vips.com/live.html=404",),
        "env_file": "",
        "required_file_counts": (),
        "password_env": ("LIVE_SITE_SSH_PASSWORD", "OLD_SITE_SSH_PASSWORD", "FYSHARK_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
        "forbidden_changed_paths": ("platform.html", "platform.css", "platform*.js", "admin.html", "admin.css", "admin.js"),
        "forbidden_env_patterns": (
            r"^TOS_",
            r"^OSS_REGION=\"?oss-cn-",
            r"^OSS_ENDPOINT=\"?https?://[^/]*oss-cn-",
            r"^OSS_CDN_REGION=\"?oss-cn-",
            r"^OSS_CDN_BASE_URL=\"?https?://[^/]*(oss-cn-|aliyuncs\.com)",
        ),
        "required_env_patterns": (
            r"^R2_ACCESS_KEY_ID=.+$",
            r"^R2_SECRET_ACCESS_KEY=.+$",
            r"^R2_ENDPOINT=.+\.r2\.cloudflarestorage\.com/?\"?$",
            r"^R2_BUCKET=\"?vipeak-media\"?$",
            r"^R2_PUBLIC_BASE_URL=\"?https://media\.123vips\.com\"?$",
        ),
    },
    "new2": {
        "host": "198.200.37.82",
        "port": 42607,
        "branch": "codex/site-667zui",
        "remote_root": "/opt/raising-game-667zui",
        "service": "raising-game-667zui",
        "health_url": "https://667zui.video/api/health",
        "env_file": "/etc/raising-game-667zui.env",
        "required_file_counts": (("/opt/raising-game-667zui/assets/ourdream/characters", 1000),),
        "password_env": ("NEW_SITE2_SSH_PASSWORD", "DEPLOY_SSH_PASSWORD"),
        "forbidden_env_patterns": (
            r"^(R2_BUCKET|CLOUDFLARE_R2_BUCKET)=\"?vipeak-media\"?$",
            r"^(R2_PUBLIC_BASE_URL|R2_PUBLIC_DOMAIN|CLOUDFLARE_R2_PUBLIC_BASE_URL|CLOUDFLARE_R2_PUBLIC_DOMAIN)=\"?https://media\.123vips\.com\"?$",
            r"^TOS_BUCKET=\"?fal-task\"?$",
            r"^TOS_PUBLIC_DOMAIN=\"?https://cdn-video\.51sux\.com\"?$",
            r"^TOS_",
            r"^OSS_REGION=\"?oss-cn-",
            r"^OSS_ENDPOINT=\"?https?://[^/]*oss-cn-",
            r"^OSS_CDN_REGION=\"?oss-cn-",
            r"^OSS_CDN_BASE_URL=\"?https?://[^/]*(oss-cn-|aliyuncs\.com)",
        ),
        "required_env_patterns": (
            r"^R2_ACCESS_KEY_ID=.+$",
            r"^R2_SECRET_ACCESS_KEY=.+$",
            r"^R2_ENDPOINT=.+\.r2\.cloudflarestorage\.com/?\"?$",
            r"^R2_BUCKET=\"?vipeak-media-667zui\"?$",
            r"^R2_PUBLIC_BASE_URL=\"?https://pub-[a-z0-9]+\.r2\.dev\"?$",
        ),
    },
}


LIVE_RELEASE_PATHS = (
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
PLATFORM_RELEASE_PATHS = (
    "platform.html",
    "platform.css",
    "platform*.js",
    "admin.html",
    "admin.css",
    "admin.js",
    "chat.html",
    "chat.css",
    "chat.js",
    "chat-live.js",
    "server.js",
    "server-source.js",
    "server.parts/**",
    "platform.ui.parts/**",
    "platform.create.parts/**",
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
)


def release_path_pattern(path_pattern: str) -> re.Pattern[str]:
    """Compile a repository-relative release pattern with ** and * support."""
    escaped = re.escape(path_pattern.strip("/"))
    escaped = escaped.replace(r"\*\*", "__DOUBLE_STAR__").replace(r"\*", "[^/]*")
    escaped = escaped.replace("__DOUBLE_STAR__", ".*")
    return re.compile(rf"^{escaped}$")


def forbidden_release_paths(paths: set[str] | list[str], patterns: tuple[str, ...]) -> list[str]:
    compiled = [(pattern, release_path_pattern(pattern)) for pattern in patterns]
    matched: list[str] = []
    for path_text in sorted(set(paths)):
        if any(regex.match(path_text) for _pattern, regex in compiled):
            matched.append(path_text)
    return matched


def release_boundary_problems(site: str, workspace: Path | None = None) -> list[str]:
    """Explain why a release branch cannot belong to the requested surface."""
    root = workspace or Path(__file__).resolve().parent.parent
    branch = TARGETS[site]["branch"]
    try:
        result = subprocess.run(
            ["git", "ls-tree", "-r", "--name-only", f"origin/{branch}"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError:
        return [f"origin/{branch} does not exist"]
    tracked = set(result.stdout.splitlines())
    problems: list[str] = []
    if site == "old":
        for path_text in forbidden_release_paths(tracked, LIVE_RELEASE_PATHS):
            problems.append(f"platform release contains live-owned path {path_text}")
    elif site == "live":
        shared_paths = {
            "chat-live.js",
            "assets/chat-live/gifts/",
            "assets/brand/default-avatar.jpg",
            "assets/brand/MaShanZheng-Regular.ttf",
            "assets/brand/wechat-logo.png",
            "assets/brand/alipay-logo.svg",
            "assets/brand/showcase/",
        }
        for path_text in forbidden_release_paths(tracked, PLATFORM_RELEASE_PATHS):
            if path_text in shared_paths or any(path_text.startswith(path) for path in shared_paths if path.endswith("/")):
                continue
            problems.append(f"live release contains platform-owned path {path_text}")
    return problems


def first_password(target: dict[str, object]) -> tuple[str, str]:
    names = target.get("password_env", ())
    for name in names:
        value = os.environ.get(name, "")
        if value:
            return name, value
    for source in target.get("local_password_files", ()):
        path = Path(str(source.get("path", "")))
        pattern = str(source.get("pattern", ""))
        if not path.exists() or not pattern:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        match = re.search(pattern, text)
        if match and match.group(1):
            return f"local-file:{path}", match.group(1)
    return "", ""


def enforce_shared_sync_for_new2() -> None:
    sync_script = Path(__file__).with_name("sync_old_to_new2.py")
    if not sync_script.exists():
        raise SystemExit(f"Missing shared sync checker: {sync_script}")
    result = subprocess.run([sys.executable, str(sync_script), "--check"], text=True)
    if result.returncode != 0:
        raise SystemExit("New2 shared code is not synced from old-site. Run: python .\\scripts\\sync_old_to_new2.py")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a fixed production target.")
    parser.add_argument("--site", choices=sorted(TARGETS), required=True, help="old=platform surface (123vips.com), live=live.123vipeak.com, new2=667zui.video")
    parser.add_argument("--port", type=int, default=None, help="Override the fixed SSH port for this site.")
    parser.add_argument("--dry-run", action="store_true", help="Print the fixed target and exit.")
    parser.add_argument("--no-restart", action="store_true", help="Pull code without restarting the service.")
    parser.add_argument("--skip-shared-sync-check", action="store_true", help="Emergency override for new2 drift guard.")
    args = parser.parse_args()

    target = TARGETS[args.site]
    port = args.port or int(os.environ.get("DEPLOY_PORT") or target["port"])
    password_source, password = first_password(target)
    print(f"[deploy-site] site={args.site}")
    print(f"[deploy-site] host={target['host']} port={port}")
    print(f"[deploy-site] branch={target['branch']}")
    print(f"[deploy-site] remote_root={target['remote_root']}")
    if target.get("runtime_root"):
        print(f"[deploy-site] runtime_root={target['runtime_root']}")
    print(f"[deploy-site] service={target['service']}")
    print(f"[deploy-site] restart={'no' if target.get('requires_restart') is False else 'yes'}")
    print(f"[deploy-site] health_url={target['health_url']}")
    for verify_url in target.get("verify_urls", ()):
        print(f"[deploy-site] verify_url={verify_url}")
    for verify_contains in target.get("verify_contains", ()):
        print(f"[deploy-site] verify_contains={verify_contains}")
    for verify_not_contains in target.get("verify_not_contains", ()):
        print(f"[deploy-site] verify_not_contains={verify_not_contains}")
    for verify_status in target.get("verify_status", ()):
        print(f"[deploy-site] verify_status={verify_status}")
    print(f"[deploy-site] env_file={target['env_file'] or '<none>'}")
    print(f"[deploy-site] password_source={password_source or '<missing>'}")
    print(f"[deploy-site] audit_base={target.get('audit_base', '<root>')}")
    for pattern in target.get("forbidden_env_patterns", ()):
        print(f"[deploy-site] forbid_env_pattern={pattern}")
    for pattern in target.get("required_env_patterns", ()):
        print(f"[deploy-site] require_env_pattern={pattern}")
    for changed_path in target.get("forbidden_changed_paths", ()):
        print(f"[deploy-site] forbid_changed_path={changed_path}")
    for required_path, minimum in target.get("required_file_counts", ()):
        print(f"[deploy-site] require_min_files={required_path}={minimum}")
    if args.dry_run:
        return
    if args.site == "new2" and not args.skip_shared_sync_check:
        enforce_shared_sync_for_new2()
    if not password:
        expected = ", ".join(target["password_env"])
        raise SystemExit(f"Missing SSH password env. Set one of: {expected}")

    repo_root = Path(__file__).resolve().parent.parent
    subprocess.run(
        ["git", "fetch", "origin", target["branch"]],
        cwd=repo_root,
        check=True,
    )
    expected_commit = subprocess.run(
        ["git", "rev-parse", f"origin/{target['branch']}"],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    print(f"[deploy-site] expected_commit={expected_commit}")
    boundary_problems = release_boundary_problems(args.site, repo_root)
    if boundary_problems:
        print("[deploy-site] release boundary check failed:", file=sys.stderr)
        for problem in boundary_problems:
            print(f"  {problem}", file=sys.stderr)
        raise SystemExit(34)
    print("[deploy-site] release_boundary=ok")
    env = os.environ.copy()
    env["DEPLOY_HOST"] = target["host"]
    env["DEPLOY_USER"] = env.get("DEPLOY_USER", "root")
    env["DEPLOY_SSH_PASSWORD"] = password
    env["DEPLOY_PORT"] = str(port)
    env["DEPLOY_ENV_FILE"] = target["env_file"]
    deploy_pull = Path(__file__).with_name("deploy_pull.py")
    command = [
        sys.executable,
        str(deploy_pull),
        "--branch",
        target["branch"],
        "--remote-root",
        target["remote_root"],
        "--service",
        target["service"],
        "--health-url",
        target["health_url"],
        "--commit",
        expected_commit,
        "--bootstrap-clone-url",
        "ssh://git@ssh.github.com:443/lengyan11001/raising-game.git",
        "--port",
        str(port),
    ]
    if args.no_restart or target.get("requires_restart") is False:
        command.append("--no-restart")
    if target.get("audit_base"):
        command.extend(["--audit-base", target["audit_base"]])
    for pattern in target.get("forbidden_env_patterns", ()):
        command.extend(["--forbid-env-pattern", pattern])
    for pattern in target.get("required_env_patterns", ()):
        command.extend(["--require-env-pattern", pattern])
    for changed_path in target.get("forbidden_changed_paths", ()):
        command.extend(["--forbid-changed-path", changed_path])
    for required_path, minimum in target.get("required_file_counts", ()):
        command.extend(["--require-min-files", f"{required_path}={minimum}"])
    for verify_url in target.get("verify_urls", ()):
        command.extend(["--verify-url", verify_url])
    for verify_contains in target.get("verify_contains", ()):
        command.extend(["--verify-contains", verify_contains])
    for verify_not_contains in target.get("verify_not_contains", ()):
        command.extend(["--verify-not-contains", verify_not_contains])
    for verify_status in target.get("verify_status", ()):
        command.extend(["--verify-status", verify_status])
    for pre_restart_command in target.get("pre_restart_commands", ()):
        command.extend(["--pre-restart-command", pre_restart_command])
    raise SystemExit(subprocess.call(command, env=env))


if __name__ == "__main__":
    main()
