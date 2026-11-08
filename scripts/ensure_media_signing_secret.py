#!/usr/bin/env python3
"""Ensure the production media-signing key exists without printing its value."""
from __future__ import annotations

import argparse
import os
import secrets
import tempfile
from pathlib import Path


KEY = "MEDIA_URL_SIGNING_SECRET"


def main() -> None:
    parser = argparse.ArgumentParser(description="Ensure MEDIA_URL_SIGNING_SECRET in an environment file.")
    parser.add_argument("--env-file", default="/etc/raising-game-demo.env")
    args = parser.parse_args()
    path = Path(args.env_file)
    if not path.is_file():
        raise SystemExit(f"Missing environment file: {path}")

    lines = path.read_text().splitlines()
    present = any(
        line.startswith(f"{KEY}=") and line.split("=", 1)[1].strip()
        for line in lines
    )
    if present:
        print(f"{KEY}=present")
        return

    lines.append(f"{KEY}={secrets.token_hex(32)}")
    mode = path.stat().st_mode & 0o777
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write("\n".join(lines) + "\n")
        os.chmod(temp_name, mode or 0o600)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    print(f"{KEY}=created")


if __name__ == "__main__":
    main()
