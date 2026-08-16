#!/usr/bin/env python3
"""Configure the Undress Telegram Mini App on the old-site server."""
from __future__ import annotations

import argparse
import json
import os
import secrets
import shlex
import urllib.request

from configure_wan27_env import (
    DEFAULT_ENV_FILE,
    DEFAULT_HEALTH_URL,
    DEFAULT_HOST,
    DEFAULT_SERVICE,
    health_check,
    read_remote_file,
    remote_run,
    upsert_env,
    write_remote_file,
)

import paramiko


DEFAULT_USER = "root"
DEFAULT_WEBAPP_URL = "https://undress.14vips.com/"
DEFAULT_WEBHOOK_PATH = "/api/telegram/webhook"


def telegram_api(token: str, method: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError(result.get("description") or f"Telegram {method} failed")
    return result


def configure_telegram_api(token: str, webapp_url: str, webhook_url: str, webhook_secret: str) -> None:
    bot = telegram_api(token, "getMe", {})["result"]
    print(f"Telegram bot: @{bot.get('username', '')}")
    telegram_api(token, "setWebhook", {
        "url": webhook_url,
        "secret_token": webhook_secret,
        "allowed_updates": ["message", "callback_query"],
        "drop_pending_updates": False,
    })
    telegram_api(token, "setChatMenuButton", {
        "menu_button": {
            "type": "commands",
            "text": "Menu",
        },
    })
    telegram_api(token, "setMyCommands", {
        "commands": [
            {"command": "start", "description": "Open Undress"},
            {"command": "history", "description": "View generation history"},
            {"command": "recharge", "description": "Recharge credits"},
            {"command": "support", "description": "Contact support"},
            {"command": "me", "description": "Open account"},
        ],
    })
    print("Telegram webhook, menu button, and commands configured.")


def configure_telegram_api_via_server(client, token: str, webapp_url: str, webhook_url: str, webhook_secret: str) -> None:
    """Use the production host for Telegram API calls when local egress is blocked."""
    requests = [
        ("getMe", {}),
        ("setWebhook", {
            "url": webhook_url,
            "secret_token": webhook_secret,
            "allowed_updates": ["message", "callback_query"],
            "drop_pending_updates": False,
        }),
        ("setChatMenuButton", {
            "menu_button": {"type": "commands", "text": "Menu"},
        }),
        ("setMyCommands", {
            "commands": [
                {"command": "start", "description": "Open Undress"},
                {"command": "history", "description": "View generation history"},
                {"command": "recharge", "description": "Recharge credits"},
                {"command": "support", "description": "Contact support"},
                {"command": "me", "description": "View account"},
            ],
        }),
    ]
    for method, payload in requests:
        command = (
            "curl --fail --silent --show-error --max-time 30 "
            f"-X POST {shlex.quote(f'https://api.telegram.org/bot{token}/{method}')} "
            "-H 'Content-Type: application/json' "
            f"--data {shlex.quote(json.dumps(payload, separators=(',', ':')))}"
        )
        result = remote_run(client, command)
        if result.rc != 0:
            raise RuntimeError(f"Remote Telegram {method} failed: {result.err.strip() or result.out.strip()}")
        print(f"remote {method}: {result.out.strip()}")
    print("Telegram webhook, menu button, and commands configured via the production host.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Configure the Undress Telegram bot.")
    parser.add_argument("--host", default=os.environ.get("FYSHARK_HOST", DEFAULT_HOST))
    parser.add_argument("--user", default=os.environ.get("FYSHARK_USER", DEFAULT_USER))
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--health-url", default=DEFAULT_HEALTH_URL)
    parser.add_argument("--webapp-url", default=os.environ.get("TELEGRAM_BOT_WEBAPP_URL", DEFAULT_WEBAPP_URL))
    parser.add_argument("--webhook-path", default=os.environ.get("TELEGRAM_BOT_WEBHOOK_PATH", DEFAULT_WEBHOOK_PATH))
    parser.add_argument("--webhook-secret", default=os.environ.get("TELEGRAM_BOT_WEBHOOK_SECRET", ""))
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--no-restart", action="store_true")
    parser.add_argument("--skip-api-config", action="store_true")
    parser.add_argument("--api-via-server", action="store_true")
    args = parser.parse_args()

    ssh_password = os.environ.get("FYSHARK_SSH_PASSWORD") or os.environ.get("DEPLOY_SSH_PASSWORD")
    if not ssh_password:
        raise SystemExit("Set FYSHARK_SSH_PASSWORD or DEPLOY_SSH_PASSWORD.")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not args.check_only and not token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN in the local process environment.")
    secret = args.webhook_secret.strip() or secrets.token_urlsafe(24)
    webhook_path = args.webhook_path.rstrip("/")
    webhook_url = f"{args.webapp_url.rstrip('/')}{webhook_path}/{secret}"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] connecting {args.user}@{args.host}")
    client.connect(args.host, username=args.user, password=ssh_password, timeout=20)
    try:
        content = read_remote_file(client, args.env_file)
        if args.check_only:
            print("Telegram env is configured:", "TELEGRAM_BOT_TOKEN=" in content and "TELEGRAM_BOT_WEBHOOK_SECRET=" in content)
            health_check(client, args.health_url)
            return
        next_content = upsert_env(content, {
            "TELEGRAM_BOT_TOKEN": token,
            "TELEGRAM_BOT_WEBAPP_URL": args.webapp_url,
            "TELEGRAM_BOT_WEBHOOK_SECRET": secret,
            "TELEGRAM_BOT_WEBHOOK_PATH": webhook_path,
        })
        write_remote_file(client, args.env_file, next_content)
        if not args.no_restart:
            result = remote_run(client, f"systemctl restart {args.service} && sleep 2 && systemctl is-active {args.service}")
            print(result.out.strip())
            if result.rc != 0:
                raise SystemExit(result.rc)
        health_check(client, args.health_url)
    finally:
        client.close()

    if not args.skip_api_config:
        if args.api_via_server:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(args.host, username=args.user, password=ssh_password, timeout=20)
            try:
                configure_telegram_api_via_server(client, token, args.webapp_url, webhook_url, secret)
            finally:
                client.close()
        else:
            configure_telegram_api(token, args.webapp_url, webhook_url, secret)


if __name__ == "__main__":
    main()
