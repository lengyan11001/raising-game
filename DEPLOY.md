# 667zui Deploy Notes

This branch is the second tenant/new-shell site for `667zui.video`.

It should stay based on the old site branch and receive old-site fixes by
merging or cherry-picking from `old-site`. Runtime differences belong in the
server environment, not in copied secrets or ad-hoc code forks.

## Scope

- Local workspace: `D:\raising-game-667zui`
- Branch: `codex/site-667zui`
- Public site: `https://667zui.video`
- Target server IP: `198.200.37.82`
- Suggested remote root: `/opt/raising-game-667zui`
- Suggested service: `raising-game-667zui`
- Upstream mode: `gateway`
- Upstream API base: `https://123vips.com`

## Runtime Contract

`667zui.video` calls the old site the same way the previous CloudToken new site
did: it sends generation and pricing requests to the old site's public API with
a configured user API token.

Required production environment:

```env
NODE_ENV=production
PORT=4174
PUBLIC_BASE_URL=https://667zui.video
SITE_STORAGE_SLUG=667zui

UPSTREAM_MODE=gateway
UPSTREAM_BASE_URL=https://123vips.com
UPSTREAM_API_TOKEN=<old-site-user-api-token>
```

Do not copy old-site Ark, Aliyun, APIZ, or other upstream provider secrets to
the 667zui server. The old site owns direct upstream access; 667zui owns its
own users, balance ledger, records, and frontend state.

The old-site user behind `UPSTREAM_API_TOKEN` must have enough credits because
the old site will bill that account when 667zui submits generation tasks.

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

## Server pull deploy

Recommended flow:

1. Push code to `codex/site-667zui` on GitHub.
2. On the server, inside `/opt/raising-game-667zui`:

```bash
git fetch origin codex/site-667zui
git checkout codex/site-667zui
git reset --hard origin/codex/site-667zui
systemctl restart raising-game-667zui
```

Runtime data must live in PostgreSQL through `DATABASE_URL`; do not use JSON files
as an alternate data store or deployment target.

From the local machine, use the helper only after pushing:

```powershell
$env:NEW_SITE2_SSH_PASSWORD = "<server-root-password>"
python .\scripts\deploy_site.py --site new2
```

Fixed production target:

- site: `new2`
- domain: `https://667zui.video`
- host: `198.200.37.82`
- branch: `codex/site-667zui`
- remote root: `/opt/raising-game-667zui`
- service: `raising-game-667zui`
- health URL: `https://667zui.video/api/health`

The old SFTP upload deploy is intentionally removed. Do not deploy by copying
files into `/opt/raising-game-667zui`; that leaves Git unable to pull cleanly.

## Keeping In Sync With Old Site

When old-site fixes should be brought into 667zui:

```bash
git fetch origin
git checkout codex/site-667zui
git merge origin/old-site
```

Resolve only real tenant-specific conflicts. Keep provider secrets in each
server's environment files, never in Git.
