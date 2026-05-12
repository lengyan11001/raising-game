# Deploy Notes

## Repo vs runtime

The Git repo should contain code and stable static assets only.

Keep these on the server and out of Git:

- `.env.local`
- `data/`
- `logs/`
- `tmp/`
- `assets/user-uploads/`
- `assets/user-characters/`
- generated runtime outputs under `assets/generated/` that are recreated or user-specific
- any ad-hoc ops scripts with embedded passwords or server login details

## Server pull deploy

Recommended flow:

1. Push code to `main` on GitHub.
2. On the server, inside `/opt/raising-game-demo`:

```bash
git fetch origin main
git checkout main
git reset --hard origin/main
systemctl restart raising-game-demo
```

This avoids overwriting runtime data like `data/app-config.json` and `data/app-db.json`.

From the local machine, use the helper only after pushing:

```powershell
$env:FYSHARK_SSH_PASSWORD="..."
python .\scripts\deploy_pull.py
```

The old SFTP upload deploy is intentionally removed. Do not deploy by copying
files into `/opt/raising-game-demo`; that leaves Git unable to pull cleanly.

## Wan2.7 production env

Wan2.7 generation requires DashScope credentials in the systemd env file used by
`raising-game-demo`.

Check the current redacted state:

```powershell
$env:FYSHARK_SSH_PASSWORD="..."
python .\scripts\configure_wan27_env.py --check-only
```

Configure or rotate the key, restart the service, and verify `/api/health`:

```powershell
$env:FYSHARK_SSH_PASSWORD="..."
$env:ALIYUN_DASHSCOPE_API_KEY="..."
python .\scripts\configure_wan27_env.py
```

The helper updates `/etc/raising-game-demo.env`, creates a timestamped backup,
restarts `raising-game-demo`, and prints only redacted key lengths.
