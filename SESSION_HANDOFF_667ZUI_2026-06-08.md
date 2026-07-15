# 667zui New-Site2 Handoff

## Scope

- Workspace: `D:\raising-game-667zui`
- Branch: `codex/site-667zui`
- Base branch: `old-site`
- Public domain: `https://667zui.video`
- Target server IP: `198.200.37.82`
- SSH port: `42607`
- Suggested remote root: `/opt/raising-game-667zui`
- Suggested service: `raising-game-667zui`

## Intended Architecture

667zui is a second tenant/new-shell site. It keeps its own frontend, users,
balances, records, uploads, and runtime data, but generation calls go through
the old site in gateway mode.

The old site remains the direct upstream owner:

- Old site domain: `https://123vips.com`
- Old site branch: `old-site`
- Old site upstream mode: `direct`
- Old site owns Ark, Aliyun, APIZ, and other provider secrets

667zui should not receive direct upstream provider keys. It should use:

```env
PUBLIC_BASE_URL=https://667zui.video
SITE_STORAGE_SLUG=667zui
UPSTREAM_MODE=gateway
UPSTREAM_BASE_URL=https://123vips.com
UPSTREAM_API_TOKEN=<old-site-user-api-token>
```

`UPSTREAM_API_TOKEN` is a normal old-site user API token. The old-site account
behind that token must have enough credits because old-site generation requests
will bill that account.

## Gateway Request Flow

667zui submits to the old site with:

```http
Authorization: Bearer <UPSTREAM_API_TOKEN>
```

The gateway code calls:

- `POST /api/platform/generate`
- `POST /api/advanced/generate`
- `POST /api/platform/estimates`
- `POST /api/advanced/estimate`
- `GET /api/generation-records/<taskId>`

667zui stores the returned upstream task id, status, and result URL in its own
records. Old-site records and old-site gateway-account billing remain separate.

## Sync Rule

This branch should stay close to `old-site`.

Bring old-site changes forward with:

```bash
git fetch origin
git checkout codex/site-667zui
git merge origin/old-site
```

Tenant-specific differences should be limited to domain recognition, deployment
docs, environment defaults, and runtime data/config.

## DNS And Server Notes

The current production target is:

```text
667zui.video -> 198.200.37.82
ssh root@198.200.37.82 -p 42607
```

Older DNS records checked earlier showed:

- `www.667zui.video` -> `104.233.149.159`
- `api.667zui.video` -> `104.233.149.159`
- `cms.667zui.video` -> `104.233.149.159`

The root domain `667zui.video` still needed a root A record at that time:

```text
667zui.video -> 198.200.37.82
```

Required ports:

```text
42607/tcp
80/tcp
443/tcp
```
