# Deploy Notes

## Repo vs runtime

The Git repo should contain code and stable static assets only.

Keep these on the server and out of Git:

- `.env.local`
- `logs/`
- `tmp/`
- `assets/user-uploads/`
- `assets/user-characters/`
- generated runtime outputs under `assets/generated/` that are recreated or user-specific
- any ad-hoc ops scripts with embedded passwords or server login details

## Old -> new2 shared-code rule

`D:\raising-game-old-asyncfix` (`origin/old-site`) is the source of truth for shared UI,
admin, DB helper, docs, and deploy tooling. `D:\raising-game-667zui`
(`codex/site-667zui`) must be synced from old-site for those files.

Before deploying new2, run this from the old-site worktree:

```powershell
python .\scripts\sync_old_to_new2.py --check
```

If it reports drift, sync from old-site to new2, then verify:

```powershell
python .\scripts\sync_old_to_new2.py
python .\scripts\sync_old_to_new2.py --check
```

The sync script intentionally does not copy runtime data, `.env` files, uploads,
generated media, or database content. `server.js` is not copied by default
because upstream invocation can differ per site; use `--include-server` only
when old-site server code is intentionally the source for that change.

## Fixed deploy commands

Old site:

```powershell
$env:OLD_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site old
```

On this dev machine, if `OLD_SITE_SSH_PASSWORD` is not set, the helper also
reads the old root SSH password from `D:\raising-game\scripts\fyshark_tail_log.py`
without printing it. That local legacy file is not a deploy mechanism; it is only
a credential source for `deploy_site.py`.

New2:

```powershell
$env:NEW_SITE2_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site new2
```

`deploy_site.py --site new2` runs the shared-code drift check before SSH. If it
fails, sync first with `python .\scripts\sync_old_to_new2.py`.

## Server pull deploy

Recommended flow:

1. Push code to `old-site` on GitHub.
2. On the server, inside `/opt/raising-game-demo`:

```bash
git fetch origin old-site
git checkout old-site
git reset --hard origin/old-site
systemctl restart raising-game-demo
```

Runtime data must live in PostgreSQL through `DATABASE_URL`; do not use JSON files
as an alternate data store or deployment target.

Production systemd must load runtime secrets and per-site settings from:

```text
/etc/raising-game-demo.env
```

`raising-game-demo.service` must include `EnvironmentFile=/etc/raising-game-demo.env`.
The local deploy helper checks this before restarting.

From the local machine, use the helper only after pushing:

```powershell
$env:OLD_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site old
```

Fixed production target:

- site: `old`
- domain: `https://123vips.com`
- host: `101.47.76.188`
- SSH port: `22`
- branch: `old-site`
- remote root: `/opt/raising-game-demo`
- service: `raising-game-demo`
- env file: `/etc/raising-game-demo.env`
- health URL: `https://123vips.com/api/health`

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
