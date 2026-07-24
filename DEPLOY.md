# CloudToken Deployment

This package is a clean handoff build. It does not include production secrets,
database dumps, uploaded files, generated results, logs, or server credentials.

## Runtime

- Node.js 20 LTS or newer
- PostgreSQL 14 or newer
- A reverse proxy such as Nginx
- Process manager: systemd
- App directory: `/opt/cloudtoken`
- Env file: `/etc/cloudtoken.env`
- Service name: `cloudtoken`

## Install

```bash
mkdir -p /opt/cloudtoken
cd /opt/cloudtoken
npm ci --omit=dev
```

Copy `.env.example` to `/etc/cloudtoken.env`, then fill real values on the
server. Do not commit or share the filled env file.

```bash
cp /opt/cloudtoken/.env.example /etc/cloudtoken.env
chmod 600 /etc/cloudtoken.env
```

Minimum required values:

```env
NODE_ENV=production
PORT=4174
PUBLIC_BASE_URL=https://your-domain.example
TENANT_PUBLIC_HOSTS=your-domain.example
DATABASE_URL=
UPSTREAM_BASE_URL=https://your-upstream.example
UPSTREAM_API_TOKEN=
```

Fill model/storage/payment variables only if those features are used. Wallet
addresses and QR codes must be configured by the new operator before accepting
payments.

## systemd

Create `/etc/systemd/system/cloudtoken.service`:

```ini
[Unit]
Description=CloudToken
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/cloudtoken
EnvironmentFile=/etc/cloudtoken.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

Start it:

```bash
systemctl daemon-reload
systemctl enable --now cloudtoken
systemctl status cloudtoken --no-pager -l
```

## Nginx

Example server block:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:4174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

Enable HTTPS with the operator's preferred certificate tool.

## First Admin

The first registered account becomes admin. Register it immediately after first
startup, then keep the credentials outside the codebase.

## Verify

```bash
curl -sS http://127.0.0.1:4174/api/health
curl -sS https://your-domain.example/api/health
```

Open:

- `https://your-domain.example/platform.html`
- `https://your-domain.example/admin.html`

## Package Exclusions

These are intentionally not included:

- `.env`, `.env.local`, or any filled env file
- `data/`
- `logs/`
- `tmp/`
- `node_modules/`
- `.git/`
- user uploads
- generated videos/results
- production wallet QR images
- local handoff notes or credentials
