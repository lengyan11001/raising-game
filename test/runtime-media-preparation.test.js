"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "ops", "prepare-runtime-media-root.py");

function invoke(args) {
  return spawnSync("python3", [script, ...args], { cwd: root, encoding: "utf8" });
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-media-prepare-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function makeSource(dir) {
  const assets = path.join(dir, "assets");
  fs.mkdirSync(path.join(assets, "user-uploads", "nested"), { recursive: true });
  fs.mkdirSync(path.join(assets, "generated", "videos"), { recursive: true });
  fs.mkdirSync(path.join(assets, "brand"), { recursive: true });
  fs.writeFileSync(path.join(assets, "user-uploads", "nested", "portrait.jpg"), "portrait");
  fs.writeFileSync(path.join(assets, "generated", "videos", "clip.mp4"), "video");
  fs.writeFileSync(path.join(assets, "brand", "logo.png"), "static");
  return assets;
}

test("runtime media preparation is dry-run by default and excludes release-owned static assets", () => {
  withTemp((dir) => {
    const assets = makeSource(dir);
    const target = path.join(dir, "shared-runtime");
    const result = invoke(["--source-assets", assets, "--target", target]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RUNTIME_MEDIA_PLAN_OK/);
    assert.match(result.stdout, /PLAN include runtime path=user-uploads/);
    assert.match(result.stdout, /PLAN create empty runtime path=admin\/home/);
    assert.equal(fs.existsSync(target), false);
  });
});

test("runtime media preparation copies only runtime paths and verifies byte content", () => {
  withTemp((dir) => {
    const assets = makeSource(dir);
    const target = path.join(dir, "shared-runtime");
    const result = invoke(["--source-assets", assets, "--target", target, "--apply"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RUNTIME_MEDIA_READY files=2 dirs=\d+ bytes=13/);
    assert.equal(fs.existsSync(path.join(target, "brand", "logo.png")), false);
    assert.equal(fs.readFileSync(path.join(target, "user-uploads", "nested", "portrait.jpg"), "utf8"), "portrait");
    assert.equal(digest(path.join(target, "generated", "videos", "clip.mp4")), digest(path.join(assets, "generated", "videos", "clip.mp4")));
    assert.equal(fs.existsSync(path.join(target, "admin", "home")), true);
    assert.equal(fs.existsSync(path.join(target, "user-characters")), true);
    assert.equal(fs.existsSync(path.join(target, "generated", "characters", "apiz")), true);
    assert.equal(fs.existsSync(path.join(target, "runtime-tmp", "video-tool-uploads")), true);
  });
});

test("runtime media preparation refuses overwrite, symlinked target, and symlinked source runtime entries", () => {
  withTemp((dir) => {
    const assets = makeSource(dir);
    const existing = path.join(dir, "existing");
    fs.mkdirSync(existing);
    const overwrite = invoke(["--source-assets", assets, "--target", existing, "--apply"]);
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /target already exists/);

    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    const linked = path.join(dir, "linked");
    fs.symlinkSync(real, linked);
    const linkedTarget = invoke(["--source-assets", assets, "--target", linked, "--apply"]);
    assert.notEqual(linkedTarget.status, 0);
    assert.match(linkedTarget.stderr, /target already exists|must not be a symlink/);

    fs.rmSync(path.join(assets, "admin"), { recursive: true, force: true });
    fs.symlinkSync(real, path.join(assets, "admin"));
    const linkedSource = invoke(["--source-assets", assets, "--target", path.join(dir, "new"), "--apply"]);
    assert.notEqual(linkedSource.status, 0);
    assert.match(linkedSource.stderr, /source runtime path contains a symlink/);
  });
});

test("runtime media preparation detects source mutation guard and remains dry-run safe", () => {
  withTemp((dir) => {
    const assets = makeSource(dir);
    const target = path.join(dir, "shared-runtime");
    const scriptSource = fs.readFileSync(script, "utf8");
    assert.match(scriptSource, /source runtime media changed during copy/);
    assert.match(scriptSource, /source runtime media changed before publish/);
    const plan = invoke(["--source-assets", assets, "--target", target]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /RUNTIME_MEDIA_PLAN_OK/);
    assert.equal(fs.existsSync(target), false);
  });
});
