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
  for (const prefix of ["user-characters", "generated/characters", "generated/panoramas"]) {
    assert.match(out, new RegExp(`location \\^~ \\/assets\\/${prefix.replace("/", "\\/")}\\/ \\{[\\s\\S]*?proxy_pass http:\\/\\/raising_game_app;`));
  }
});

test("Old Nginx hardening is idempotent", () => {
  const { dir, input } = tempFixture();
  const once = path.join(dir, "once");
  const twice = path.join(dir, "twice");
  transform(input, once);
  transform(once, twice);
  assert.equal(fs.readFileSync(once, "utf8"), fs.readFileSync(twice, "utf8"));
});
