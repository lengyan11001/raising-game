"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const deploySite = fs.readFileSync(path.join(root, "scripts", "deploy_site.py"), "utf8");
const deployPull = fs.readFileSync(path.join(root, "scripts", "deploy_pull.py"), "utf8");
const materializer = path.join(root, "scripts", "materialize_static_release.py");
const snapshotBuilder = path.join(root, "scripts", "build_release_snapshot.py");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function runPython(source) {
  return run("python3", ["-c", source]);
}

function writeFile(file, content = "x\n") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test("production deploy targets use isolated release branches and roots", () => {
  assert.match(deploySite, /"branch": "platform-release"/);
  assert.match(deploySite, /"remote_root": "\/opt\/raising-game-demo"/);
  assert.match(deploySite, /"audit_base": "release-base\/platform"/);
  assert.match(deploySite, /"branch": "live-release"/);
  assert.match(deploySite, /"remote_root": "\/opt\/raising-game-live-src"/);
  assert.match(deploySite, /"static_root": "\/opt\/raising-game-live-static"/);
  assert.match(deploySite, /"audit_base": "release-base\/live"/);
  assert.match(deploySite, /"requires_restart": False/);
  assert.match(deploySite, /materialize_static_release\.py --source \/opt\/raising-game-live-src --target \/opt\/raising-game-live-static --profile live/);
  assert.match(deploySite, /"https:\/\/123vips\.com\/live\.html=404"/);
  assert.match(deploySite, /"https:\/\/123vips\.com\/=Vipeak AI"/);
  assert.match(deploySite, /"https:\/\/123vips\.com\/=Vipeak Live"/);
  assert.match(deployPull, /Refusing to deploy an integration branch/);
  assert.match(deployPull, /--audit-base/);
  assert.match(deployPull, /--forbid-changed-path/);
  assert.match(deployPull, /--verify-status/);
  assert.match(deployPull, /--verify-private-media/);
  assert.match(deployPull, /--post-restart-command/);
  assert.match(deployPull, /pre_restart_check = "true" if args\.no_restart else/);
  assert.match(deployPull, /post_restart_check = "true" if args\.no_restart else/);
  assert.match(deploySite, /args\.no_restart or target\.get\("requires_restart"\) is False/);
  assert.match(deploySite, /env\["DEPLOY_NO_RESTART"\] = "1"/);
  assert.match(deployPull, /os\.environ\.get\("DEPLOY_NO_RESTART"\) == "1"/);
  assert.match(deployPull, /args\.no_restart = True/);
  assert.match(deployPull, /no-restart main_pid_before=/);
  assert.match(deployPull, /no-restart PID changed:/);
  assert.match(deployPull, /no-restart PID unchanged:/);
  assert.match(deploySite, /"post_restart_commands": \(\s*"\/opt\/raising-game-demo\/ops\/harden-old-nginx-private-media\.sh"/s);
  assert.match(deploySite, /91-stop-timeout\.conf/);
  assert.match(deploySite, /TimeoutStopSec=300/);
  for (const assetPrefix of ["user-uploads", "admin/voice-preview", "user-characters", "generated/characters/apiz", "generated/panoramas"]) {
    assert.match(deployPull, new RegExp(`private_probe /assets/${assetPrefix.replace("/", "\\/")}/`));
  }
  assert.match(deployPull, /Deployed commit mismatch/);
  assert.match(deployPull, /403\|404/);
  assert.match(deployPull, /Private media bypass detected/);
  assert.match(deployPull, /for attempt in 1 2 3 4 5 6 7 8 9 10/);
  assert.match(deployPull, /--stop-timeout-seconds/);
  assert.match(deployPull, /90-generation-submit-drain\.conf/);
  assert.match(deployPull, /TimeoutStopSec=%s/);
  assert.match(deployPull, /systemctl daemon-reload/);
  assert.doesNotMatch(deployPull, /systemctl set-property/);
  assert.match(deployPull, /max\(360, args\.stop_timeout_seconds \+ 120\)/);
  assert.match(deploySite, /target\.get\("stop_timeout_seconds", 240\)/);
  assert.ok(deploySite.includes('f"refs/remotes/origin/{target[\'branch\']}^{{commit}}"'));
  assert.doesNotMatch(deployPull, /AutoAddPolicy/);
  assert.match(deployPull, /class PinnedHostKeyPolicy/);
  assert.match(deployPull, /--host-key-sha256/);
  assert.match(deploySite, /SHA256:FjIDikg5kkvITUdxOc2142HRn\+WP5A7Bj6Z5fReu8lI/);
});

test("deployment SSH accepts only the pinned SHA-256 host key", () => {
  const output = runPython(String.raw`
import base64
import hashlib
import importlib.util
from pathlib import Path
import paramiko

root = Path(${JSON.stringify(root)})
spec = importlib.util.spec_from_file_location("deploy_pull", root / "scripts" / "deploy_pull.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
trusted = paramiko.RSAKey.generate(1024)
untrusted = paramiko.RSAKey.generate(1024)
fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(trusted.asbytes()).digest()).decode().rstrip("=")
policy = module.PinnedHostKeyPolicy([fingerprint])
policy.missing_host_key(None, "example.test", trusted)
try:
    policy.missing_host_key(None, "example.test", untrusted)
except paramiko.SSHException as exc:
    assert "host key mismatch" in str(exc)
else:
    raise AssertionError("untrusted host key was accepted")
print("ok")
`);
  assert.match(output, /ok/);
});

test("integration branches are rejected before any SSH connection", () => {
  for (const branch of ["old-site", "main"]) {
    const result = spawnSync("python3", [path.join(root, "scripts", "deploy_pull.py"), "--branch", branch], {
      cwd: root,
      env: { ...process.env, DEPLOY_SSH_PASSWORD: "not-used" },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Refusing to deploy an integration branch/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /\[ssh\] connecting/);
  }
});

test("platform history rejects 33a6e65 even when a later commit deletes live files", () => {
  const output = runPython(String.raw`
import importlib.util
import json
from pathlib import Path

root = Path(${JSON.stringify(root)})
spec = importlib.util.spec_from_file_location("deploy_pull", root / "scripts" / "deploy_pull.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
patterns = [
    "live.html", "live.css", "live.js", "qrcode.js", "site-landing.*",
    "downloads/vipeak-live.apk", "mobile/live-android/**",
    "assets/brand/live-*", "assets/chat-live/moans/**",
    "assets/chat-live/welcome-newcomer*",
]
entries = module.changed_entries_for_release(root, "33a6e65^", "HEAD")
matched = module.forbidden_release_entries(entries, patterns)
assert "live.html" in matched, matched
assert "live.css" in matched, matched
assert "live.js" in matched, matched
assert "downloads/vipeak-live.apk" in matched, matched
assert "mobile/live-android/src/com/vipeak/live/MainActivity.java" in matched, matched
print(json.dumps(matched))
`);
  assert.match(output, /live\.html/);
});

test("release history permits deleting foreign paths but rejects all ways of introducing them", () => {
  const output = runPython(String.raw`
import importlib.util
from pathlib import Path

root = Path(${JSON.stringify(root)})
spec = importlib.util.spec_from_file_location("deploy_pull", root / "scripts" / "deploy_pull.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
patterns = [
    "live.html", "live.css", "live.js", "qrcode.js", "site-landing.*",
    "downloads/vipeak-live.apk", "mobile/live-android/**",
    "assets/brand/live-*", "assets/chat-live/moans/**",
    "assets/chat-live/welcome-newcomer*",
]
assert module.forbidden_release_entries([("D", "live.html")], patterns) == []
assert module.forbidden_release_entries([("R100", "archive/live.html")], patterns) == []
for entry in [
    ("A", "live.html"),
    ("M", "live.css"),
    ("C100", "live.js"),
    ("R100", "live.html"),
    ("A", "mobile/live-android/src/com/vipeak/live/MainActivity.java"),
    ("A", "assets/brand/live-logo.png"),
    ("A", "assets/chat-live/moans/joanna.wav"),
    ("A", "assets/chat-live/welcome-newcomer.webp"),
]:
    assert module.forbidden_release_entries([entry], patterns), entry
print("ok")
`);
  assert.match(output, /ok/);
});

test("live surface helpers block live-owned paths on platform and retain chat-live", () => {
  const liveSurface = require(path.join(root, "lib-live-surface"));
  assert.equal(liveSurface.isLiveOwnedStaticPath("/live.html"), true);
  assert.equal(liveSurface.isLiveOwnedStaticPath("/downloads/vipeak-live.apk"), true);
  assert.equal(liveSurface.isLiveOwnedStaticPath("/assets/brand/live-logo.png"), true);
  assert.equal(liveSurface.isLiveOwnedStaticPath("/assets/chat-live/moans/joanna.wav"), true);
  assert.equal(liveSurface.isLiveOwnedStaticPath("/chat-live.js"), false);
  assert.equal(liveSurface.shouldBlockLiveOwnedStatic({ pathname: "/live.html", toolId: "" }), true);
  assert.equal(liveSurface.shouldBlockLiveOwnedStatic({ pathname: "/live.html", toolId: "live" }), false);
  assert.equal(liveSurface.shouldBlockLiveOwnedStatic({ pathname: "/chat-live.js", toolId: "chat" }), false);
  assert.equal(liveSurface.shouldBlockLiveOwnedStatic({ pathname: "/site-landing.html", isStandaloneLandingHost: true }), false);
  assert.equal(liveSurface.resolveLiveStaticRoot(root, ""), "/opt/raising-game-live-static");
  assert.doesNotMatch(deploySite, /liveStaticSurfaceRequest[^\n]*\|\|\s*ROOT/);
});

test("live materializer copies only allowlisted static files and atomically replaces the target", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "live-release-"));
  const source = path.join(workspace, "source");
  const target = path.join(workspace, "target");
  fs.mkdirSync(source, { recursive: true });
  run("git", ["init", "-q"], { cwd: source });
  run("git", ["config", "user.email", "test@example.com"], { cwd: source });
  run("git", ["config", "user.name", "Test"], { cwd: source });

  const files = [
    "live.html", "live.css", "live.js", "chat-live.js", "qrcode.js",
    "site-landing.html", "site-landing.css", "site-landing.js",
    "downloads/vipeak-live.apk", "assets/chat-live/gifts/flower.svg",
    "assets/chat-live/moans/joanna.wav", "assets/chat-live/welcome-newcomer.webp",
    "assets/brand/default-avatar.jpg", "assets/brand/MaShanZheng-Regular.ttf",
    "assets/brand/wechat-logo.png", "assets/brand/alipay-logo.svg",
    "assets/brand/live-logo.png", "assets/brand/showcase/campus.webp",
    "mobile/live-android/README.md", "server.js", "platform.html",
    "assets/chat-live/welcome-other.webp",
  ];
  for (const file of files) writeFile(path.join(source, file), file);
  writeFile(path.join(source, ".env.local"), "SECRET=1\n");
  run("git", ["add", "."], { cwd: source });
  run("git", ["commit", "-qm", "fixture"], { cwd: source });

  fs.mkdirSync(target, { recursive: true });
  writeFile(path.join(target, "stale.txt"), "stale\n");
  run("python3", [materializer, "--source", source, "--target", target, "--profile", "live"]);

  for (const file of [
    "live.html", "chat-live.js", "site-landing.html", "downloads/vipeak-live.apk",
    "assets/chat-live/gifts/flower.svg", "assets/chat-live/moans/joanna.wav",
    "assets/chat-live/welcome-newcomer.webp", "assets/brand/live-logo.png",
    "assets/brand/showcase/campus.webp", "mobile/live-android/README.md",
  ]) {
    assert.equal(fs.existsSync(path.join(target, file)), true, file);
  }
  for (const file of ["server.js", "platform.html", ".env.local", "assets/chat-live/welcome-other.webp", "stale.txt"]) {
    assert.equal(fs.existsSync(path.join(target, file)), false, file);
  }
});

test("deployment key auth is preferred and never falls back to password", () => {
  assert.match(deployPull, /SSH_KEY = os\.environ\.get\("FYSHARK_SSH_KEY", os\.environ\.get\("DEPLOY_SSH_KEY", ""\)\)/);
  assert.match(deployPull, /if not PASSWORD and not SSH_KEY:/);
  assert.match(deployPull, /if SSH_KEY:/);
  assert.match(deployPull, /key_filename=SSH_KEY/);
  assert.match(deployPull, /password=None/);
  assert.match(deployPull, /look_for_keys=False/);
  assert.match(deployPull, /allow_agent=False/);
  assert.match(deploySite, /password_source, password = \("", ""\) if key_path else first_password\(target\)/);
  assert.match(deploySite, /auth=key:/);
  assert.match(deploySite, /env\.pop\("DEPLOY_SSH_PASSWORD", None\)/);
  assert.match(deploySite, /env\.pop\("FYSHARK_SSH_PASSWORD", None\)/);
  assert.match(deploySite, /key_env.*DEPLOY_SSH_KEY/);
});

test("Old deployment migrates PostgreSQL before service restart", () => {
  assert.match(deploySite, /node ops\/run-db-migrations\.js --dry-run && node ops\/run-db-migrations\.js --apply && node ops\/run-db-migrations\.js --dry-run/);
  assert.match(deploySite, /\. \/etc\/raising-game-demo\.env/);
});

test("release snapshot builder excludes foreign paths from both trees and ancestry", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "release-snapshot-"));
  const source = path.join(workspace, "source");
  fs.mkdirSync(source, { recursive: true });
  run("git", ["init", "-q"], { cwd: source });
  run("git", ["config", "user.email", "test@example.com"], { cwd: source });
  run("git", ["config", "user.name", "Test"], { cwd: source });

  const files = [
    "DEPLOY.md", "scripts/build_release_snapshot.py", "scripts/ensure_media_signing_secret.py",
    "scripts/deploy_pull.py", "scripts/deploy_site.py", "scripts/materialize_static_release.py",
    "ops/apply-production-tuning.sh",
    "live.html", "live.css", "live.js", "chat-live.js", "qrcode.js",
    "site-landing.html", "site-landing.css", "site-landing.js",
    "downloads/vipeak-live.apk", "mobile/live-android/MainActivity.java",
    "assets/brand/live-logo.png", "assets/chat-live/moans/joanna.wav",
    "assets/chat-live/gifts/flower.svg", "assets/brand/default-avatar.jpg",
    "test/live-upload-poster-nav.test.js", "verification/live-transaction/ROLLBACK.sh",
    "platform.html", "platform.js", "admin.html", "admin.js", "chat.html",
    "chat.js", "server.js", "db.js", "readiness.js", "package.json", "lib-live-surface.js",
    "assets/ourdream/characters/one.webp", "assets/admin/one.webp",
  ];
  for (const file of files) writeFile(path.join(source, file), file);
  run("git", ["add", "."], { cwd: source });
  run("git", ["commit", "-qm", "fixture"], { cwd: source });
  run("python3", [snapshotBuilder, "--repo-root", source, "--source", "HEAD"], { cwd: source });

  const platformTree = run("git", ["ls-tree", "-r", "--name-only", "platform-release"], { cwd: source }).split("\n").filter(Boolean);
  const liveTree = run("git", ["ls-tree", "-r", "--name-only", "live-release"], { cwd: source }).split("\n").filter(Boolean);
  for (const file of ["live.html", "live.css", "live.js", "downloads/vipeak-live.apk", "test/live-upload-poster-nav.test.js"]) {
    assert.equal(platformTree.includes(file), false, file);
  }
  for (const file of ["platform.html", "admin.html", "server.js", "db.js", "readiness.js", "package.json", "scripts/ensure_media_signing_secret.py", "ops/apply-production-tuning.sh"]) {
    assert.equal(liveTree.includes(file), false, file);
  }
  assert.equal(platformTree.includes("readiness.js"), true, "platform release must include server readiness dependency");
  for (const file of ["live.html", "chat-live.js", "assets/chat-live/moans/joanna.wav"]) {
    assert.equal(liveTree.includes(file), true, file);
  }
  assert.equal(platformTree.includes("scripts/build_release_snapshot.py"), true, "platform release must include its release tooling");
  assert.equal(liveTree.some((file) => file.startsWith("scripts/")), false);
  assert.equal(run("git", ["rev-list", "--count", "release-base/platform..platform-release"], { cwd: source }).trim(), "1");
  run("git", ["update-ref", "refs/remotes/origin/platform-release", "release-base/platform"], { cwd: source });
  run("git", ["update-ref", "-d", "refs/heads/platform-release"], { cwd: source });
  writeFile(path.join(source, "readiness.js"), "readiness\n");
  run("git", ["add", "readiness.js"], { cwd: source });
  run("git", ["commit", "-qm", "readiness fixture"], { cwd: source });
  run("python3", [snapshotBuilder, "--repo-root", source, "--source", "HEAD"], { cwd: source });
  assert.equal(run("git", ["rev-parse", "platform-release^"], { cwd: source }).trim(), run("git", ["rev-parse", "release-base/platform"], { cwd: source }).trim());
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", "origin/platform-release", "platform-release"], { cwd: source });
  assert.equal(ancestor.status, 0, ancestor.stderr);
  assert.equal(run("git", ["rev-list", "--count", "release-base/live..live-release"], { cwd: source }).trim(), "1");
});
