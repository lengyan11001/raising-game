#!/usr/bin/env python3
"""Submit and poll a minimal Wan 3.0 Video Prime Agentic Mobile task."""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_BASE_URL = "https://model-intl.aimobile.wuying.aliyuncs.com/us-east-1"
CREATE_PATH = "/api/v1/services/aigc/video-generation/video-synthesis"


def request_json(url: str, api_key: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="GET" if body is None else "POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Agentic Mobile request failed (HTTP {error.code}): {detail}")


def task_id_from(payload: dict) -> str:
    output = payload.get("output") or payload.get("data") or {}
    return str(output.get("task_id") or output.get("taskId") or payload.get("task_id") or payload.get("taskId") or "")


def task_state(payload: dict) -> str:
    output = payload.get("output") or payload.get("data") or payload
    return str(output.get("task_status") or output.get("status") or payload.get("status") or "UNKNOWN").upper()


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe Wan 3.0 Video Prime on Agentic Mobile.")
    parser.add_argument("--key-file", help="File containing the node API key.")
    parser.add_argument("--base-url", default=os.environ.get("ALIYUN_WAN30_PRIME_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--prompt", default="A small orange cat runs along a sunny beach, cinematic tracking shot.")
    parser.add_argument("--wait", action="store_true", help="Poll until terminal status.")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()

    api_key = os.environ.get("ALIYUN_WAN30_PRIME_API_KEY", "").strip()
    if not api_key and args.key_file:
        api_key = Path(args.key_file).read_text(encoding="utf-8").strip()
    if not api_key:
        raise SystemExit("Set ALIYUN_WAN30_PRIME_API_KEY or pass --key-file.")

    base_url = args.base_url.rstrip("/")
    created = request_json(base_url + CREATE_PATH, api_key, {
        "model": "wan3.0-video-prime",
        "input": {"prompt": args.prompt},
    })
    task_id = task_id_from(created)
    if not task_id:
        raise SystemExit(f"Prime create response returned no task id: {json.dumps(created, ensure_ascii=False)}")
    print(json.dumps({"ok": True, "taskId": task_id, "status": task_state(created)}, ensure_ascii=False), flush=True)
    if not args.wait:
        return 0

    deadline = time.time() + max(30, args.timeout)
    while time.time() < deadline:
        result = request_json(f"{base_url}/api/v1/tasks/{task_id}", api_key)
        state = task_state(result)
        print(json.dumps({"taskId": task_id, "status": state}, ensure_ascii=False), flush=True)
        if state in {"SUCCEEDED", "SUCCESS", "COMPLETED", "FAILED", "ERROR", "CANCELED", "CANCELLED"}:
            if state not in {"SUCCEEDED", "SUCCESS", "COMPLETED"}:
                raise SystemExit(2)
            return 0
        time.sleep(5)
    raise SystemExit(f"Timed out waiting for Prime task {task_id}.")


if __name__ == "__main__":
    raise SystemExit(main())
