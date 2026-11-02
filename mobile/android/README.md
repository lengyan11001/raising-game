# 123Tops Video Android wrapper

This is a minimal native WebView shell for `https://123tops.com/`.

Build from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_tool_installers.ps1
```

Build a channel package without editing source files:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_tool_installers.ps1 `
  -Channel douyin `
  -VersionCode 2 `
  -VersionName 1.0.1
```

This creates `downloads/123tops-video-douyin.apk` and `downloads/123tops-video-douyin.mobileconfig`. Use the same `VersionCode` for all channel variants in one release and increment it for every later app update. Channel variants keep the same package id and signing key, so they are one upgradable Android app rather than separate side-by-side apps.

`OutputName` defaults to `123tops-video-<channel>`. Override it or the target site when needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_tool_installers.ps1 `
  -Channel telegram `
  -OutputName 123tops-video-telegram `
  -BaseUrl https://123tops.com/ `
  -VersionCode 2 `
  -VersionName 1.0.1
```

Generated channel variants are ignored by Git by default. Force-add only an exact channel artifact when it must be published from the website.

The first build creates a release signing keystore and its generated credentials under `%USERPROFILE%\.123tops`. Keep that directory private and backed up. Android updates must use the same keystore.

Build outputs are written to `downloads/`. No signing secrets are stored in the repository.
