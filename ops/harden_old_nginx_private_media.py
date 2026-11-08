#!/usr/bin/env python3
"""Proxy private media through the app on the Old production Nginx sites.

This is an Nginx-only production repair: it never restarts the Node service.
It removes direct-file locations for user uploads, voice previews, and the
broad /assets/admin/ alias, replacing them with the exact public admin-media
allowlist plus app-proxied private prefixes.
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path

DEFAULT_FILES = (
    "/etc/nginx/sites-enabled/default",
    "/etc/nginx/sites-enabled/123vip.fans",
    "/etc/nginx/sites-available/default",
    "/etc/nginx/sites-available/123vip.fans",
)

PUBLIC_ADMIN_HEADERS = {
    "location ^~ /assets/admin/home/ {",
    "location ^~ /assets/admin/advanced-cases/ {",
    "location ^~ /assets/admin/platform-templates/ {",
}
PRIVATE_MEDIA_HEADERS = {
    "location ^~ /assets/admin/voice-preview/ {",
    "location ^~ /assets/user-uploads/ {",
    "location ^~ /assets/user-characters/ {",
    "location ^~ /assets/generated/characters/ {",
    "location ^~ /assets/generated/panoramas/ {",
}
REMOVE_HEADERS = {"location ^~ /assets/admin/ {"} | PUBLIC_ADMIN_HEADERS | PRIVATE_MEDIA_HEADERS

HARDENED_BLOCK = '''    # Public reference media is the only admin directory served from disk.
    location ^~ /assets/admin/home/ {
        # managed private-media allowlist
        alias /opt/raising-game-demo/assets/admin/home/;
        access_log off;
        expires 1h;
        add_header Cache-Control "public, max-age=3600" always;
        try_files $uri =404;
    }

    location ^~ /assets/admin/advanced-cases/ {
        # managed private-media allowlist
        alias /opt/raising-game-demo/assets/admin/advanced-cases/;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable" always;
        try_files $uri =404;
    }

    location ^~ /assets/admin/platform-templates/ {
        # managed private-media allowlist
        alias /opt/raising-game-demo/assets/admin/platform-templates/;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable" always;
        try_files $uri =404;
    }

    # Private media must pass through Node authorization/signature checks.
    location ^~ /assets/admin/voice-preview/ {
        # managed private-media proxy
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ^~ /assets/user-uploads/ {
        # managed private-media proxy
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ^~ /assets/user-characters/ {
        # managed private-media proxy
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ^~ /assets/generated/characters/ {
        # managed private-media proxy
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ^~ /assets/generated/panoramas/ {
        # managed private-media proxy
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

'''


def location_blocks(text: str) -> list[tuple[int, int, str]]:
    blocks: list[tuple[int, int, str]] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        start = offset
        offset += len(line)
        if not stripped.startswith("location "):
            continue
        opening = text.find("{", start, offset)
        if opening < 0:
            raise ValueError(f"location line has no opening brace at offset {start}")
        depth = 0
        end = opening
        while end < len(text):
            char = text[end]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end += 1
                    if end < len(text) and text[end] == "\n":
                        end += 1
                    blocks.append((start, end, text[start:end]))
                    break
            end += 1
        else:
            raise ValueError(f"unterminated location block at offset {start}")
    return blocks


def first_line(block: str) -> str:
    return block.splitlines()[0].strip() if block.splitlines() else ""


def is_hardened_private_block(block: str) -> bool:
    return (
        "# managed private-media proxy" in block
        and "proxy_pass http://raising_game_app;" in block
        and "proxy_set_header X-Forwarded-Proto $scheme;" in block
    )


def harden_config(text: str) -> str:
    stale = []
    public_blocks = []
    private_blocks = []
    for span in location_blocks(text):
        header = first_line(span[2])
        if header == "location ^~ /assets/admin/ {":
            stale.append(span)
        elif header in PUBLIC_ADMIN_HEADERS:
            # The generated public blocks advertise the managed allowlist.
            if "managed private-media allowlist" in span[2]:
                public_blocks.append(span)
            else:
                stale.append(span)
        elif header in PRIVATE_MEDIA_HEADERS:
            # Regenerate an older proxy block so adding a new protected prefix
            # upgrades an existing host; keep exact generated blocks idempotent.
            if is_hardened_private_block(span[2]):
                private_blocks.append(span)
            else:
                stale.append(span)
    if len(public_blocks) == 3 and len(private_blocks) == len(PRIVATE_MEDIA_HEADERS):
        return text
    for start, end, _ in sorted(stale + public_blocks + private_blocks, key=lambda item: item[0], reverse=True):
        text = text[:start] + text[end:]

    remaining = location_blocks(text)
    # Insert beside the first remaining location, or before the server's final
    # closing brace when all known private blocks were the only locations in a
    # fixture. The hardening block is self-contained and keeps its public admin
    # aliases and private proxies in one auditable place.
    insert_at = remaining[0][0] if remaining else text.rfind("}")
    if insert_at < 0:
        raise ValueError("expected a server block closing brace")
    if not remaining:
        insert_at -= 1
        while insert_at >= 0 and text[insert_at] in " \t\r\n":
            insert_at -= 1
        insert_at += 1 if insert_at < 0 else 0
        if insert_at == 0:
            raise ValueError("could not find insertion point")
        # rfind("}") points at the server's closing brace; insert immediately
        # before its line so the generated block stays inside the server.
        line_start = text.rfind("\n", 0, insert_at) + 1
        insert_at = line_start
    return text[:insert_at] + HARDENED_BLOCK + text[insert_at:]


def write_atomic(path: Path, content: str) -> None:
    mode = path.stat().st_mode
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, mode)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*", default=list(DEFAULT_FILES))
    parser.add_argument("--source", help="Read this fixture instead of a production file")
    parser.add_argument("--output", help="Write fixture output instead of modifying the source")
    parser.add_argument("--check", action="store_true", help="Exit 1 when hardening changes are needed")
    parser.add_argument("--apply", action="store_true", help="Write hardened files atomically")
    args = parser.parse_args()

    if args.source:
        text = Path(args.source).read_text(encoding="utf-8")
        hardened = harden_config(text)
        if args.output:
            Path(args.output).write_text(hardened, encoding="utf-8")
        elif args.check:
            return 0 if hardened == text else 1
        else:
            sys.stdout.write(hardened)
        return 0

    files = [Path(item) for item in (args.files or DEFAULT_FILES)]
    if not args.check and not args.apply:
        parser.error("use --check or --apply for production files")
    pending: list[Path] = []
    for path in files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        hardened = harden_config(text)
        if hardened != text:
            pending.append(path)
            if args.apply:
                write_atomic(path, hardened)
    if args.check:
        for path in pending:
            print(f"needs-hardening={path}")
        return 1 if pending else 0
    for path in pending:
        print(f"hardened={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
