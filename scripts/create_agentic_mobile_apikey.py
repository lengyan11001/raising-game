#!/usr/bin/env python3
"""Create an Agentic Mobile node API key with Alibaba Cloud ACS3 signing.

Credentials are read from environment variables so they do not appear in the
process command line:

  ALIBABA_CLOUD_ACCESS_KEY_ID
  ALIBABA_CLOUD_ACCESS_KEY_SECRET

The generated API key is written to --output with owner-only permissions.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import stat
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


API_VERSION = "2023-09-30"
SIGNATURE_ALGORITHM = "ACS3-HMAC-SHA256"
# International Agentic Mobile nodes (and the us-east-1 inference endpoint)
# are managed through the international control-plane endpoint.
DEFAULT_ENDPOINT = "eds-aic.ap-southeast-1.aliyuncs.com"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_request(ak: str, sk: str, instance_ids: list[str], endpoint: str) -> urllib.request.Request:
    body_params: dict[str, str] = {"Action": "CreateApiKey", "Version": API_VERSION}
    for index, instance_id in enumerate(instance_ids, start=1):
        body_params[f"InstanceIds.{index}"] = instance_id
    body = urllib.parse.urlencode(body_params).encode("utf-8")
    headers = {
        "host": endpoint,
        "x-acs-action": "CreateApiKey",
        "x-acs-version": API_VERSION,
        "x-acs-date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "x-acs-signature-nonce": uuid.uuid4().hex,
        "content-type": "application/x-www-form-urlencoded",
    }
    signed_keys = sorted(headers)
    canonical_headers = "".join(f"{key}:{headers[key]}\n" for key in signed_keys)
    signed_headers = ";".join(signed_keys)
    canonical_request = "\n".join([
        "POST",
        "/",
        "",
        canonical_headers,
        signed_headers,
        sha256_hex(body),
    ])
    string_to_sign = f"{SIGNATURE_ALGORITHM}\n{sha256_hex(canonical_request.encode('utf-8'))}"
    signature = hmac.new(sk.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    headers["Authorization"] = (
        f"{SIGNATURE_ALGORITHM} Credential={ak},"
        f"SignedHeaders={signed_headers},Signature={signature}"
    )
    return urllib.request.Request(f"https://{endpoint}/", data=body, headers=headers, method="POST")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an Agentic Mobile node API key.")
    parser.add_argument("instance_ids", nargs="+", help="Agentic Mobile node IDs (acp-...).")
    parser.add_argument("--endpoint", default=os.environ.get("EDS_AIC_ENDPOINT", DEFAULT_ENDPOINT))
    parser.add_argument("--output", required=True, help="Private file that receives the generated API key.")
    args = parser.parse_args()

    ak = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID", "").strip()
    sk = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "").strip()
    if not ak or not sk:
        raise SystemExit("Set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET.")
    invalid = [value for value in args.instance_ids if not value.startswith("acp-")]
    if invalid:
        raise SystemExit(f"Invalid Agentic Mobile node ID: {invalid[0]}")

    request = build_request(ak, sk, args.instance_ids, args.endpoint)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            message = parsed.get("Message") or parsed.get("message") or detail
            code = parsed.get("Code") or parsed.get("code") or "HTTP_ERROR"
            request_id = parsed.get("RequestId") or parsed.get("requestId") or ""
            raise SystemExit(f"CreateApiKey failed ({code}, HTTP {error.code}): {message}; RequestId={request_id}")
        except json.JSONDecodeError:
            raise SystemExit(f"CreateApiKey failed (HTTP {error.code}): {detail}")

    items = payload.get("Data") or payload.get("data") or []
    wanted = set(args.instance_ids)
    result = next((item for item in items if str(item.get("InstanceId") or item.get("instanceId")) in wanted), None)
    api_key = str((result or {}).get("ApiKey") or (result or {}).get("apiKey") or "").strip()
    if not api_key:
        raise SystemExit(f"CreateApiKey returned no API key; RequestId={payload.get('RequestId', '')}")

    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(api_key + "\n", encoding="utf-8")
    try:
        output.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    print(json.dumps({
        "ok": True,
        "instanceId": str(result.get("InstanceId") or result.get("instanceId") or ""),
        "keyPrefix": str(result.get("KeyPrefix") or result.get("keyPrefix") or api_key[:8]),
        "status": str(result.get("Status") or result.get("status") or ""),
        "requestId": str(payload.get("RequestId") or payload.get("requestId") or ""),
        "output": str(output),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
