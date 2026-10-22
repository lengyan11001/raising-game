#!/usr/bin/env bash
set -euo pipefail

CHANNEL="${CHANNEL:-android-app}"
OUTPUT_NAME="${OUTPUT_NAME:-vipeak-live}"
BASE_URL="${BASE_URL:-https://live.123vipeak.com/}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.0}"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"

if [[ ! "$CHANNEL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Invalid CHANNEL" >&2; exit 1
fi

python3 - "$BASE_URL" "$CHANNEL" << 'PY' > /tmp/vipeak-live-start-url.txt
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
base, channel = sys.argv[1], sys.argv[2]
parts = urlsplit(base)
query = dict(parse_qsl(parts.query, keep_blank_values=True))
query["channel"] = channel
print(urlunsplit((parts.scheme, parts.netloc, parts.path or "/", urlencode(query), parts.fragment)))
PY
START_URL="$(cat /tmp/vipeak-live-start-url.txt)"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_ROOT="$ROOT/mobile/live-android"
BUILD_ROOT="$ANDROID_ROOT/build"
DOWNLOAD_ROOT="$ROOT/downloads"

if [[ -z "$SDK_ROOT" ]]; then
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [[ -d "$candidate" ]]; then SDK_ROOT="$candidate"; break; fi
  done
fi
if [[ -z "$SDK_ROOT" || ! -d "$SDK_ROOT" ]]; then
  echo "Android SDK not found. Set ANDROID_SDK_ROOT." >&2
  exit 1
fi

BUILD_TOOLS="$(ls -1d "$SDK_ROOT"/build-tools/* 2>/dev/null | sort -V | tail -n 1 || true)"
PLATFORM="$(ls -1d "$SDK_ROOT"/platforms/android-* 2>/dev/null | sort -t- -k2 -n | tail -n 1 || true)"
if [[ -z "$BUILD_TOOLS" || -z "$PLATFORM" ]]; then
  echo "Android build-tools or platforms missing under $SDK_ROOT" >&2
  exit 1
fi

ANDROID_JAR="$PLATFORM/android.jar"
AAPT="$BUILD_TOOLS/aapt"
AAPT2="$BUILD_TOOLS/aapt2"
D8="$BUILD_TOOLS/d8"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT/classes" "$BUILD_ROOT/dex" "$BUILD_ROOT/generated" "$BUILD_ROOT/source/com/vipeak/live" "$DOWNLOAD_ROOT"

python3 - "$ANDROID_ROOT/src/com/vipeak/live/MainActivity.java" "$BUILD_ROOT/source/com/vipeak/live/MainActivity.java" "$START_URL" << 'PY'
from pathlib import Path
import re, sys
src, dest, url = sys.argv[1], sys.argv[2], sys.argv[3]
text = Path(src).read_text()
text2, n = re.subn(r'private static final String START_URL = "[^"]+";', f'private static final String START_URL = "{url}";', text, count=1)
if n != 1:
    raise SystemExit("could not inject START_URL")
Path(dest).write_text(text2)
PY

javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$BUILD_ROOT/classes" \
  "$BUILD_ROOT/source/com/vipeak/live/MainActivity.java"

jar cf "$BUILD_ROOT/classes.jar" -C "$BUILD_ROOT/classes" com
"$D8" --lib "$ANDROID_JAR" --min-api 24 --output "$BUILD_ROOT/dex" "$BUILD_ROOT/classes.jar"
"$AAPT2" compile --dir "$ANDROID_ROOT/res" -o "$BUILD_ROOT/resources.zip"
"$AAPT2" link -o "$BUILD_ROOT/unsigned.apk" -I "$ANDROID_JAR" \
  --manifest "$ANDROID_ROOT/AndroidManifest.xml" \
  --java "$BUILD_ROOT/generated" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --auto-add-overlay -R "$BUILD_ROOT/resources.zip"

( cd "$BUILD_ROOT/dex" && "$AAPT" add "$BUILD_ROOT/unsigned.apk" classes.dex )
"$ZIPALIGN" -p -f 4 "$BUILD_ROOT/unsigned.apk" "$BUILD_ROOT/aligned.apk"

SIGNING_ROOT="$HOME/.vipeak-live"
mkdir -p "$SIGNING_ROOT"
CONFIG="$SIGNING_ROOT/android-signing.json"
KEYSTORE="$SIGNING_ROOT/vipeak-live-release.jks"
if [[ ! -f "$CONFIG" ]]; then
  PASS="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
  keytool -genkeypair -v -storetype JKS -keystore "$KEYSTORE" \
    -storepass "$PASS" -keypass "$PASS" -alias vipeak-live \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -dname "CN=Vipeak Live, OU=Mobile, O=Vipeak, L=Hong Kong, C=HK"
  python3 - "$CONFIG" "$KEYSTORE" "$PASS" << 'PY'
import json, sys
from pathlib import Path
Path(sys.argv[1]).write_text(json.dumps({"alias":"vipeak-live","password":sys.argv[3],"keystore":sys.argv[2]}))
PY
fi

python3 - "$CONFIG" "$APKSIGNER" "$BUILD_ROOT/aligned.apk" "$DOWNLOAD_ROOT/${OUTPUT_NAME}.apk" << 'PY'
import json, os, subprocess, sys
from pathlib import Path
cfg = json.loads(Path(sys.argv[1]).read_text())
os.environ["APK_SIGNING_PASSWORD"] = cfg["password"]
cmd = [sys.argv[2], "sign", "--ks", cfg["keystore"], "--ks-key-alias", cfg["alias"],
       "--ks-pass", "env:APK_SIGNING_PASSWORD", "--key-pass", "env:APK_SIGNING_PASSWORD",
       "--v4-signing-enabled", "false", "--out", sys.argv[4], sys.argv[3]]
subprocess.check_call(cmd)
PY

"$APKSIGNER" verify --verbose --print-certs "$DOWNLOAD_ROOT/${OUTPUT_NAME}.apk"
echo "Built $DOWNLOAD_ROOT/${OUTPUT_NAME}.apk (channel=$CHANNEL, url=$START_URL, versionCode=$VERSION_CODE)"
