# 123Tops Video Android wrapper

This is a minimal native WebView shell for `https://123tops.com/`.

Build from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_tool_installers.ps1
```

The first build creates a release signing keystore and its generated credentials under `%USERPROFILE%\.123tops`. Keep that directory private and backed up. Android updates must use the same keystore.

Build outputs are written to `downloads/`. No signing secrets are stored in the repository.
