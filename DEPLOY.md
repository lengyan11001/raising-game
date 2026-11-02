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

The old-site production package is now authoritative on replacement server
`47.84.76.131`. The former host is only a temporary reverse-proxy rollback path
while DNS changes propagate; do not deploy application code or database changes to
the former host.

## Replacement server DNS cutover

Keep the existing Cloudflare proxy setting and change the origin address for these
records to `47.84.76.131`:

- `123vips.com`
- `www.123vips.com`
- `api.123vips.com`
- `admin.123vips.com`
- `123tops.com`
- `www.123tops.com`
- `video.123tops.com`
- `undress.14vips.com`

Verify the HTTPS health endpoint and each public page after the records update.
The former host at `101.47.76.188` currently keeps Nginx and a temporary SSH
reverse proxy enabled, so it must remain online until DNS propagation is complete.
Only then disable `raising-game-new-proxy` and Nginx on the former host. Do not
remove its backup or database until the new origin has been observed serving all
domains successfully.

## Production topology (do not confuse these domains)

`123vips.com` and `live.123vipeak.com` are **not separate production deployments**.
Both Nginx server blocks proxy to the same `raising-game-demo` process on
`47.84.76.131:4174`; the hostname selects the tenant/page (`platform.html` versus
`live.html`). A code release therefore ships to the shared process, even when the
visible change belongs to only one domain.

Use the target that names the surface you intend to verify:

- `old`: shared platform surface, verified at `https://123vips.com`
- `live`: Vipeak Live tenant on the same host/process, verified at `https://live.123vipeak.com`

Do not call `old` a "live-only" deployment. Do not treat a successful
`123vips.com/api/health` check as proof that a live change was verified. The deploy
helper rejects path overlap between these two targets: `old` refuses changes to
`live.html`, `live.css`, or `live.js`; `live` refuses platform/admin/landing
frontend changes. Shared backend changes must still be reviewed for tenant-specific
effects and tested on both domains.

## Fixed deploy commands

Shared platform surface (`123vips.com`):

```powershell
$env:OLD_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site old
```

Vipeak Live tenant (`live.123vipeak.com`, same host/process):

```powershell
$env:LIVE_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site live
```

The deploy helper requires the replacement server password through the environment;
it does not read passwords from legacy files.

New2:

```powershell
$env:NEW_SITE2_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site new2
```

`deploy_site.py --site new2` runs the shared-code drift check before SSH. If it
fails, sync first with `python .\scripts\sync_old_to_new2.py`.

All current production targets also enforce a minimum character-media file count before
pulling or restarting. This prevents a fresh server with an empty
`assets/ourdream/characters/` directory from publishing broken Explore and SEO
images. New2 must keep these files on its own server or its own storage; its
runtime configuration must not point at the old site's R2 bucket or CDN.

## Server pull deploy

## Public access controls

Production sets `BLOCK_MAINLAND_CHINA=1` so public pages, login, and API requests carrying Cloudflare country code `CN` return `451`. CMS/admin traffic remains available on the configured CMS host.

`PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED=0` keeps legacy Alibaba models hidden while the family-specific switches control public exposure. `PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED=1` exposes Wan3.0 only. `PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED=1` exposes Wan2.7, Wan Animate, and Wan2.7 image editing. `PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED=1` exposes HappyHorse. `PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED=1` exposes Qwen Image 3.0. These values are runtime switches; restart the service after changing them.

Qwen uses `ALIYUN_QWEN_IMAGE3_BASE_URL` and `ALIYUN_QWEN_IMAGE3_API_KEY` when set, otherwise it falls back to `ALIYUN_DASHSCOPE_BASE_URL` and `ALIYUN_DASHSCOPE_API_KEY`. This permits one Singapore Maas credential set for Wan2.7, HappyHorse, and Qwen while preserving an explicit override for a future Qwen-only account.

Recommended flow:

1. Commit and push code to `old-site` on GitHub. Reconcile any tracked server changes first; the deploy helper refuses a dirty worktree.
2. On the server, inside `/opt/raising-game-demo`:

```bash
git checkout old-site
git pull --ff-only origin old-site
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

Fixed production targets:

- site: `old`
  - verifies: `https://123vips.com`
  - health URL: `https://123vips.com/api/health`
- site: `live`
  - verifies: `https://live.123vipeak.com`
  - health URL: `https://live.123vipeak.com/api/health`
- both shared targets use host `47.84.76.131`, SSH port `22`, branch `old-site`,
  remote root `/opt/raising-game-demo`, service `raising-game-demo`, and env file
  `/etc/raising-game-demo.env`

The old SFTP upload deploy is intentionally removed. Do not deploy by copying
files into `/opt/raising-game-demo`; that leaves Git unable to pull cleanly.

Before restarting, the helper rejects commits that touch another target's owned
frontend files. After restarting, it requires the exact local commit, an HTTP 200
health response, and the expected domain-specific page markers. A live release
must also leave `https://123vips.com/` serving `platform.css` and `Vipeak AI`.

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
