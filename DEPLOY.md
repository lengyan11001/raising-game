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
server behavior, admin, DB helper, docs, tests, and deploy tooling. `D:\raising-game-667zui`
(`codex/site-667zui`) must be synced from old-site for those files. Site-specific upstream
routing is selected by each server's environment (`UPSTREAM_MODE` and gateway credentials),
not by maintaining a second server implementation.

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
generated media, or database content. `server.js` and `video-tools.js` are included
in the default sync. Do not patch new2's shared backend separately; change old-site
first and sync it.

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

Both production targets also enforce a minimum character-media file count before
pulling or restarting. This prevents a fresh server with an empty
`assets/ourdream/characters/` directory from publishing broken Explore and SEO
images. New2 must keep these files on its own server or its own storage; its
runtime configuration must not point at the old site's R2 bucket or CDN.

## Server pull deploy

## Public access controls

Production sets `BLOCK_MAINLAND_CHINA=1` so public pages, login, and API requests carrying Cloudflare country code `CN` return `451`. CMS/admin traffic remains available on the configured CMS host.

`PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED=0` hides the Alibaba Wan family, Qwen Image 3.0, HappyHorse, and Wan image/animate entries from public model controls and public model documentation. Seedance and Seedream remain available. Set it to `1` and restart the service to expose the hidden model family again; no code change is required.

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

## Object storage

Production object storage is Cloudflare R2 only. Do not configure or restore a
TOS fallback. Each site must use its own bucket and public base URL:

- old site: `vipeak-media` via `https://media.123vips.com`
- new2: `vipeak-media-667zui` via its dedicated R2 public domain

Both environment files must define `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_REGION=auto`, `R2_BUCKET`, and
`R2_PUBLIC_BASE_URL`. Remove every `TOS_*` entry. The fixed deploy helper rejects
a deployment if R2 is incomplete, if TOS settings remain, or if new2 points at
the old site's bucket/domain.

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

## Telegram Undress Mini App

Telegram users open the existing `undress.14vips.com` tenant. The bot does not
have a second generation or billing implementation. `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_BOT_WEBHOOK_SECRET` belong only in `/etc/raising-game-demo.env`.

The webhook endpoint is:

```text
https://undress.14vips.com/api/telegram/webhook/<TELEGRAM_BOT_WEBHOOK_SECRET>
```

The Mini App validates Telegram `initData` on the server and creates a user in
the `tool-undress-14vips` tenant. Generation notifications contain links back
to the existing history page; generated media is not sent through Telegram.
