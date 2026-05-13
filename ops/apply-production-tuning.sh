#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/raising-game-demo}"
SERVICE="${SERVICE:-raising-game-demo}"
ENV_FILE="${ENV_FILE:-/etc/raising-game-demo.env}"
NGINX_MAIN="${NGINX_MAIN:-/etc/nginx/nginx.conf}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/default}"
BACKUP_DIR="${BACKUP_DIR:-/root/raising-game-config-backups}"
STAMP="$(date +%Y%m%d%H%M%S)"

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root." >&2
    exit 1
  fi
}

backup_file() {
  local file="$1"
  if [ -f "$file" ]; then
    mkdir -p "$BACKUP_DIR"
    local safe_name
    safe_name="$(echo "$file" | sed 's|^/||; s|/|__|g')"
    cp -p "$file" "${BACKUP_DIR}/${safe_name}.bak.${STAMP}"
    echo "backup=${BACKUP_DIR}/${safe_name}.bak.${STAMP}"
  fi
}

move_stale_included_backups() {
  mkdir -p "$BACKUP_DIR"
  find /etc/nginx/sites-enabled -maxdepth 1 -type f -name '*.bak.*' -exec mv -f {} "$BACKUP_DIR"/ \;
}

upsert_env() {
  local key="$1"
  local value="$2"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

write_nginx_main() {
  cat > "$NGINX_MAIN" <<'NGINX'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log warn;
include /etc/nginx/modules-enabled/*.conf;

worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    access_log /var/log/nginx/access.log;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    client_body_timeout 60s;
    client_header_timeout 20s;
    send_timeout 120s;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
NGINX
}

write_nginx_site() {
  cat > "$NGINX_SITE" <<'NGINX'
# managed by raising-game production tuning
map $http_x_forwarded_proto $forwarded_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      "";
}

upstream raising_game_app {
    server 127.0.0.1:4174;
    keepalive 64;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 123vips.com www.123vips.com api.123vips.com admin.123vips.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name 123vips.com www.123vips.com;

    ssl_certificate     /etc/letsencrypt/live/123vips.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/123vips.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 20m;

    location ^~ /assets/generated/videos/ {
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering on;
    }

    location ^~ /assets/admin/ {
        alias /opt/raising-game-demo/assets/admin/;
        access_log off;
        expires 1h;
        add_header Cache-Control "public, max-age=3600" always;
        try_files $uri =404;
    }

    location ^~ /assets/user-uploads/ {
        alias /opt/raising-game-demo/assets/user-uploads/;
        access_log off;
        expires 1h;
        add_header Cache-Control "public, max-age=3600" always;
        try_files $uri =404;
    }

    location ^~ /assets/generated/characters/ {
        alias /opt/raising-game-demo/assets/generated/characters/;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable" always;
        try_files $uri =404;
    }

    location ^~ /assets/generated/panoramas/ {
        alias /opt/raising-game-demo/assets/generated/panoramas/;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable" always;
        try_files $uri =404;
    }

    location ^~ /__protected_assets__/ {
        internal;
        alias /opt/raising-game-demo/assets/;
        add_header Accept-Ranges bytes always;
    }

    location = /platform.html {
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ~* \.(?:css|js|html|json|ico|svg|png|jpg|jpeg|webp|woff2?)$ {
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering on;
    }

    location /api/ {
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
        proxy_buffering on;
    }

    location / {
        proxy_pass http://raising_game_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
        proxy_buffering on;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.123vips.com;

    ssl_certificate     /etc/letsencrypt/live/123vips.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/123vips.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /api/ {
        proxy_pass http://raising_game_app/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $forwarded_proto;
        proxy_set_header Connection "";
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }

    location / {
        return 404;
    }
}
NGINX
}

write_systemd_override() {
  mkdir -p "/etc/systemd/system/${SERVICE}.service.d"
  cat > "/etc/systemd/system/${SERVICE}.service.d/production.conf" <<'SYSTEMD'
[Service]
Environment=NODE_ENV=production
Environment=UV_THREADPOOL_SIZE=16
LimitNOFILE=65535
TasksMax=8192
Restart=always
RestartSec=2
SYSTEMD
}

require_root
cd "$APP_DIR"
move_stale_included_backups

backup_file "$ENV_FILE"
upsert_env NODE_ENV production
upsert_env PGPOOL_MAX "${PGPOOL_MAX:-20}"
upsert_env PGPOOL_IDLE_TIMEOUT_MS "${PGPOOL_IDLE_TIMEOUT_MS:-30000}"
upsert_env PGPOOL_CONNECTION_TIMEOUT_MS "${PGPOOL_CONNECTION_TIMEOUT_MS:-5000}"
upsert_env PGPOOL_MAX_USES "${PGPOOL_MAX_USES:-7500}"
upsert_env HTTP_KEEP_ALIVE_TIMEOUT_MS "${HTTP_KEEP_ALIVE_TIMEOUT_MS:-65000}"
upsert_env HTTP_HEADERS_TIMEOUT_MS "${HTTP_HEADERS_TIMEOUT_MS:-70000}"
upsert_env HTTP_REQUEST_TIMEOUT_MS "${HTTP_REQUEST_TIMEOUT_MS:-180000}"
upsert_env HTTP_MAX_REQUESTS_PER_SOCKET "${HTTP_MAX_REQUESTS_PER_SOCKET:-1000}"
upsert_env HTTP_MAX_CONNECTIONS "${HTTP_MAX_CONNECTIONS:-2000}"

backup_file "$NGINX_MAIN"
backup_file "$NGINX_SITE"
write_nginx_main
write_nginx_site
write_systemd_override

nginx -t
systemctl daemon-reload
systemctl reload nginx
systemctl restart "$SERVICE"
sleep 2
systemctl is-active nginx
systemctl is-active "$SERVICE"
curl -sS -m 20 https://123vips.com/api/health
printf '\n'
