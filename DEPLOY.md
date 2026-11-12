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

## Production topology (release surfaces are isolated)

`123vips.com` and `live.123vipeak.com` share one `raising-game-demo` process on
`47.84.76.131:4174`, but they do **not** share a release checkout:

- `123vips.com` runs from `platform-release` at `/opt/raising-game-demo`.
- Vipeak Live runs from `live-release` at `/opt/raising-game-live-src`.
- The Live release is materialized as static files into
  `/opt/raising-game-live-static`, which the shared process reads only for Live
  hosts. A Live release does not restart the process.
- The platform process returns `404` for Live-owned static paths.

Release history is audited from immutable clean boundaries:

- platform: `release-base/platform`
- Live: `release-base/live`

The audit covers every commit in `AUDIT_BASE..origin/BRANCH`. A release may
delete a path owned by another surface while constructing its clean tree, but it
may never add, modify, copy, or rename that path back in. This means a Live-only
commit cannot enter a platform release even if a later commit deletes the Live
files again.

Use the target that names the surface you intend to verify:

- `old`: platform surface, verified at `https://123vips.com`
- `live`: Vipeak Live, verified at `https://live.123vipeak.com`

Do not call `old` a "Live-only" deployment. Do not treat a successful
`123vips.com/api/health` check as proof that a Live change was verified. Platform
deployment verifies that Live-owned paths return `404` on `123vips.com`; Live
deployment verifies the Live site, the standalone landing site, and that the
platform home page still serves `platform.css` and `Vipeak AI`.

## Fixed deploy commands

Platform (`123vips.com`):

```powershell
$env:OLD_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site old
```

Vipeak Live (`live.123vipeak.com`):

```powershell
$env:LIVE_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site live
```

The deploy helper requires the server password through the environment; it does
not read passwords from legacy files.

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

Do not deploy `old-site` or `main` directly. Push integration work first, then
create a release snapshot on `platform-release` or `live-release`. The deploy
helper refuses integration branches before opening an SSH connection.

Recommended flow:

1. Commit and push integration work to `old-site` on GitHub.
2. Build the intended release snapshot and push `platform-release` or
   `live-release`.
3. Run `python scripts/deploy_site.py --site old` or `--site live` from the local
   checkout. The helper fetches the release branch, audits its complete release
   history, pulls the exact expected commit on the server, and verifies the
   surface-specific pages.

Runtime data must live in PostgreSQL through `DATABASE_URL`; do not use JSON files
as an alternate data store or deployment target.

For a release that includes schema changes, run the migration runner before restarting:

```text
node ops/run-db-migrations.js --dry-run
node ops/run-db-migrations.js --apply
```

The runner is dry-run by default and requires an explicit `--apply`. The application
starts in schema-verify mode; it fails readiness with `DATABASE_SCHEMA_NOT_READY`
instead of performing schema DDL during startup. Do not set
`DB_SCHEMA_MIGRATION_MODE=bootstrap` in production after this rollout.

Keep the previous release available for rollback. Schema migrations are
forward-compatible: rolling back the application must not undo the schema
ledger or drop columns. If readiness is not green after restart, stop the
rollout and roll back the application release; do not bypass readiness or
run ad-hoc DDL against production.

Production systemd must load runtime secrets and per-site settings from:

```text
/etc/raising-game-demo.env
```

`raising-game-demo.service` must include `EnvironmentFile=/etc/raising-game-demo.env`.
The local deploy helper checks this before restarting.

## Public access controls

Production sets `BLOCK_MAINLAND_CHINA=1` so public pages, login, and API requests carrying Cloudflare country code `CN` return `451`. CMS/admin traffic remains available on the configured CMS host.

`PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED=0` keeps legacy Alibaba models hidden while the family-specific switches control public exposure. `PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED=1` exposes Wan3.0 only. `PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED=1` exposes Wan2.7, Wan Animate, and Wan2.7 image editing. `PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED=1` exposes HappyHorse. `PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED=1` exposes Qwen Image 3.0. These values are runtime switches; restart the service after changing them.

Qwen uses `ALIYUN_QWEN_IMAGE3_BASE_URL` and `ALIYUN_QWEN_IMAGE3_API_KEY` when set, otherwise it falls back to `ALIYUN_DASHSCOPE_BASE_URL` and `ALIYUN_DASHSCOPE_API_KEY`. This permits one Singapore Maas credential set for Wan2.7, HappyHorse, and Qwen while preserving an explicit override for a future Qwen-only account.

## Object storage

Production object storage supports Cloudflare R2 and Alibaba Cloud OSS. R2 is
retained for existing media; OSS may be enabled only in Singapore or the US.
Never use `oss-cn-*` or a mainland-China OSS/CDN endpoint. Do not change the
existing `media.123vips.com` Cloudflare/R2 DNS record; use a separate CDN
hostname such as `assets-cdn.123vips.com` for OSS.

Each site must use its own bucket and public base URL:

- old site R2: `vipeak-media` via `https://media.123vips.com`
- new2 R2: `vipeak-media-667zui` via its dedicated R2 public domain

For OSS set `STORAGE_PROVIDER=oss`, the complete `OSS_*` block from
`.env.example`, and a Singapore/US `OSS_REGION`. If OSS is selected with
incomplete configuration, the service fails startup instead of falling back to
R2. Historical R2 records remain readable through their stored R2 URL/provider.
`OSS_CDN_REGION` must be the same approved Singapore/US region as `OSS_REGION`.
`OSS_CDN_BASE_URL` must be the dedicated CDN hostname, not an `aliyuncs.com`
OSS origin or any `oss-cn-*` endpoint.
Remove every legacy `TOS_*` entry. The fixed deploy helper rejects TOS settings
and still enforces the per-site R2 bucket/domain isolation.

From the local machine, use the helper only after pushing:

```powershell
$env:OLD_SITE_SSH_PASSWORD="..."
python .\scripts\deploy_site.py --site old
```

Fixed production targets:

- site: `old`
  - branch: `platform-release`
  - remote root: `/opt/raising-game-demo`
  - health URL: `https://123vips.com/api/health`
- site: `live`
  - branch: `live-release`
  - remote root: `/opt/raising-game-live-src`
  - static root: `/opt/raising-game-live-static`
  - health URL: `https://live.123vipeak.com/api/health`
- both targets use host `47.84.76.131`, SSH port `22`, and service
  `raising-game-demo`; only the platform release restarts the service.

The old SFTP upload deploy is intentionally removed. Do not deploy by copying
files into `/opt/raising-game-demo`; that leaves Git unable to pull cleanly.

Before pulling, both the local and remote helpers audit the complete release
history. After deployment, the helper requires the exact expected commit, an HTTP
200 health response, and the expected domain-specific page markers. Platform
deployment additionally requires Live-owned paths to return `404` on
`https://123vips.com`. Live deployment requires the Live surface and standalone
landing page while confirming the platform home still serves `platform.css` and
`Vipeak AI`.

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
