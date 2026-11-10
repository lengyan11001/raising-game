"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "ops", "harden_old_nginx_private_media.py");
const fixture = `server {
    location ^~ /assets/admin/ {
        alias /opt/raising-game-demo/assets/admin/;
    }
    location ^~ /assets/admin/voice-preview/ {
        alias /opt/raising-game-demo/assets/admin/voice-preview/;
    }
    location ^~ /assets/user-uploads/ {
        alias /opt/raising-game-demo/assets/user-uploads/;
        expires 1h;
    }
    location ^~ /assets/user-characters/ {
        alias /opt/raising-game-demo/assets/user-characters/;
    }
    location ^~ /assets/generated/characters/ {
        alias /opt/raising-game-demo/assets/generated/characters/;
    }
    location ^~ /assets/generated/panoramas/ {
        alias /opt/raising-game-demo/assets/generated/panoramas/;
    }
}
`;

function tempFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nginx-private-"));
  const input = path.join(dir, "default");
  fs.writeFileSync(input, fixture);
  return { dir, input };
}

function transform(input, output) {
  const result = spawnSync("python3", [script, "--source", input, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("Old Nginx hardening proxies private media and keeps only public admin dirs on disk", () => {
  const { dir, input } = tempFixture();
  const output = path.join(dir, "out");
  transform(input, output);
  const out = fs.readFileSync(output, "utf8");
  assert.doesNotMatch(out, /alias \/opt\/raising-game-demo\/assets\/user-uploads\//);
  assert.doesNotMatch(out, /alias \/opt\/raising-game-demo\/assets\/admin\/voice-preview\//);
  assert.doesNotMatch(out, /alias \/opt\/raising-game-demo\/assets\/user-characters\//);
  assert.doesNotMatch(out, /alias \/opt\/raising-game-demo\/assets\/generated\/characters\//);
  assert.doesNotMatch(out, /alias \/opt\/raising-game-demo\/assets\/generated\/panoramas\//);
  assert.doesNotMatch(out, /alias \/opt\/raising-game-demo\/assets\/admin\/;\n/);
  assert.match(out, /location \^~ \/assets\/user-uploads\/ \{[\s\S]*?proxy_pass http:\/\/raising_game_app;/);
  assert.match(out, /location \^~ \/assets\/admin\/voice-preview\/ \{[\s\S]*?proxy_pass http:\/\/raising_game_app;/);
  for (const name of ["home", "advanced-cases", "platform-templates"]) {
    assert.match(out, new RegExp(`alias /opt/raising-game-demo/assets/admin/${name}/;`));
  }
  for (const prefix of ["admin/voice-preview", "user-uploads", "user-characters", "generated/characters", "generated/panoramas"]) {
    const block = out.split("location ^~ /assets/")[1] && out
      .split(/\n    location \^~ \/assets\//)
      .find((part) => part.startsWith(`${prefix}/`));
    assert.ok(block, prefix);
    assert.match(block, /limit_conn raising_private_media_per_ip 8;/);
    assert.match(block, /limit_req zone=raising_private_media_per_ip burst=40 nodelay;/);
  }
  assert.equal((out.match(/limit_conn raising_private_media_per_ip 8;/g) || []).length, 5);
  assert.equal((out.match(/limit_req zone=raising_private_media_per_ip burst=40 nodelay;/g) || []).length, 5);
});

test("Old private-media hardening installs Nginx limit zones and validates before reload", () => {
  const wrapper = fs.readFileSync(path.join(root, "ops", "harden-old-nginx-private-media.sh"), "utf8");
  const tuning = fs.readFileSync(path.join(root, "ops", "apply-production-tuning.sh"), "utf8");
  const zone = /limit_conn_zone \$binary_remote_addr zone=raising_private_media_per_ip:10m;/;
  const rate = /limit_req_zone \$binary_remote_addr zone=raising_private_media_per_ip:10m rate=20r\/s;/;
  assert.match(wrapper, zone);
  assert.match(wrapper, rate);
  assert.match(tuning, zone);
  assert.match(tuning, rate);
  assert.match(wrapper, /nginx -t/);
  assert.match(wrapper, /systemctl reload nginx/);
});

test("private media responses use browser-only caching while rejecting CDN caches", () => {
  const server = fs.readFileSync(path.join(root, "server.parts", "part-42.js"), "utf8");
  assert.match(server, /protectedMediaCacheControl/);
  assert.match(server, /private, max-age=\$\{Math\.min\(3600, remainingSeconds\)\}, immutable/);
  assert.match(server, /"cdn-cache-control": "no-store"/);
  assert.match(server, /"cloudflare-cdn-cache-control": "no-store"/);
  assert.doesNotMatch(server, /isProtectedMedia \? "private, no-store"/);
});

test("Old Nginx hardening is idempotent", () => {
  const { dir, input } = tempFixture();
  const once = path.join(dir, "once");
  const twice = path.join(dir, "twice");
  transform(input, once);
  transform(once, twice);
  assert.equal(fs.readFileSync(once, "utf8"), fs.readFileSync(twice, "utf8"));
});


test("Old Nginx hardening changes only media-serving server blocks", () => {
  const { dir, input } = tempFixture();
  const config = fs.readFileSync(input, "utf8");
  fs.writeFileSync(input, `# redirect host\nserver {\n    listen 80;\n    server_name 123vips.com;\n    location / { return 301 https://$host$request_uri; }\n}\n\n${config}\n# api-only host\nserver {\n    listen 443 ssl;\n    server_name api.123vips.com;\n    location /api/ { proxy_pass http://raising_game_app; }\n}\n`);
  const output = path.join(dir, "out");
  transform(input, output);
  const out = fs.readFileSync(output, "utf8");
  assert.match(out, /# redirect host\nserver \{\n    listen 80;/);
  assert.match(out, /# api-only host\nserver \{\n    listen 443 ssl;\n    server_name api\.123vips\.com;\n    location \/api\/ \{ proxy_pass http:\/\/raising_game_app; \}\n\}/);
  assert.equal((out.match(/location \^~ \/assets\/user-uploads\/ \{/g) || []).length, 1);
  assert.equal((out.match(/managed private-media proxy/g) || []).length, 5);
  // The media-serving host must not lend its asset routes to redirect-only or
  // API-only virtual hosts that share the same sites-enabled file.
  const mediaHost = out.slice(out.indexOf("server_name 123vips.com"), out.indexOf("server_name api.123vips.com"));
  assert.match(mediaHost, /location \^~ \/assets\/user-characters\/ \{/);
  const apiHost = out.slice(out.indexOf("server_name api.123vips.com"));
  assert.doesNotMatch(apiHost, /location \^~ \/assets\/user-characters\/ \{/);
  assert.ok(out.indexOf("location ~ (^|/)\\.") < out.indexOf("location ^~ /assets/"));
});
