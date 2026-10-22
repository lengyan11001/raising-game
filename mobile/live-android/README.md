# Vipeak Live Android wrapper

Minimal WebView shell for `https://live.123vipeak.com/`.

This is a separate app from `123Tops Video`. Package id is `com.vipeak.live`.

Build from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_live_android.ps1
```

On macOS / Linux, if the Android SDK is installed:

```bash
ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" bash scripts/build_live_android.sh
```

Channel package:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_live_android.ps1 `
  -Channel douyin `
  -VersionCode 1 `
  -VersionName 1.0.0
```

Output is `downloads/vipeak-live.apk` or `downloads/vipeak-live-<channel>.apk`.

The first build creates a release keystore under `%USERPROFILE%\.vipeak-live` (Windows) or `$HOME/.vipeak-live` (Unix). Keep that directory private. Updates must use the same keystore.
