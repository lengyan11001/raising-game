"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "ops", "sync-runtime-media-root.py");

function invoke(args) {
  return spawnSync("python3", [script, ...args], { cwd: root, encoding: "utf8" });
}

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-media-sync-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test("runtime media sync is dry-run by default and reports only missing files", () => {
  withTemp((dir) => {
    const source = path.join(dir, "old-assets");
    const target = path.join(dir, "shared");
    write(path.join(source, "user-uploads", "present.jpg"), "same");
    write(path.join(source, "user-uploads", "late.jpg"), "late");
    write(path.join(source, "generated", "videos", "new.mp4"), "video");
    write(path.join(target, "user-uploads", "present.jpg"), "same");
    const result = invoke(["--source-assets", source, "--target", target]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PLAN files=3 same=1 missing=2 collisions=0/);
    assert.match(result.stdout, /RUNTIME_MEDIA_SYNC_PLAN_OK/);
    assert.equal(fs.existsSync(path.join(target, "user-uploads", "late.jpg")), false);
  });
});

test("runtime media sync copies missing files without overwriting standby writes", () => {
  withTemp((dir) => {
    const source = path.join(dir, "old-assets");
    const target = path.join(dir, "shared");
    write(path.join(source, "user-uploads", "same.jpg"), "same");
    write(path.join(source, "user-uploads", "late.jpg"), "late");
    write(path.join(source, "generated", "images", "new.png"), "new");
    write(path.join(target, "user-uploads", "same.jpg"), "same");
    write(path.join(target, "user-uploads", "standby.jpg"), "standby");
    const result = invoke(["--source-assets", source, "--target", target, "--apply"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RUNTIME_MEDIA_SYNC_READY copied_files=2 copied_bytes=7/);
    assert.equal(fs.readFileSync(path.join(target, "user-uploads", "late.jpg"), "utf8"), "late");
    assert.equal(fs.readFileSync(path.join(target, "generated", "images", "new.png"), "utf8"), "new");
    assert.equal(fs.readFileSync(path.join(target, "user-uploads", "standby.jpg"), "utf8"), "standby");
  });
});

test("runtime media sync is idempotent after a successful apply", () => {
  withTemp((dir) => {
    const source = path.join(dir, "old-assets");
    const target = path.join(dir, "shared");
    write(path.join(source, "user-uploads", "late.jpg"), "late");
    write(path.join(target, "user-uploads", "late.jpg"), "late");
    const result = invoke(["--source-assets", source, "--target", target, "--apply"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PLAN files=1 same=1 missing=0 collisions=0/);
    assert.match(result.stdout, /RUNTIME_MEDIA_SYNC_READY copied_files=0 copied_bytes=0/);
  });
});

test("runtime media sync blocks content collisions without mutating either tree", () => {
  withTemp((dir) => {
    const source = path.join(dir, "old-assets");
    const target = path.join(dir, "shared");
    write(path.join(source, "user-uploads", "collision.jpg"), "old");
    write(path.join(target, "user-uploads", "collision.jpg"), "standby-new");
    const result = invoke(["--source-assets", source, "--target", target, "--apply"]);
    assert.equal(result.status, 3);
    assert.match(result.stdout, /RUNTIME_MEDIA_COLLISION path=user-uploads\/collision.jpg reason=size differs/);
    assert.match(result.stderr, /RUNTIME_MEDIA_SYNC_BLOCKED/);
    assert.equal(fs.readFileSync(path.join(target, "user-uploads", "collision.jpg"), "utf8"), "standby-new");
  });
});

test("runtime media sync detects same-size content collisions by SHA-256", () => {
  withTemp((dir) => {
    const source = path.join(dir, "old-assets");
    const target = path.join(dir, "shared");
    write(path.join(source, "user-uploads", "collision.jpg"), "old");
    write(path.join(target, "user-uploads", "collision.jpg"), "new");
    const result = invoke(["--source-assets", source, "--target", target]);
    assert.equal(result.status, 3);
    assert.match(result.stdout, /content differs/);
    assert.equal(fs.readFileSync(path.join(target, "user-uploads", "collision.jpg"), "utf8"), "new");
  });
});

test("runtime media sync rejects symlinked source and destination directories", () => {
  withTemp((dir) => {
    const source = path.join(dir, "old-assets");
    const target = path.join(dir, "shared");
    const outside = path.join(dir, "outside");
    fs.mkdirSync(path.join(source, "user-uploads"), { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(source, "user-uploads", "linked"));
    const sourceResult = invoke(["--source-assets", source, "--target", target]);
    assert.equal(sourceResult.status, 2);
    assert.match(sourceResult.stderr, /source tree contains a symlink/);

    fs.rmSync(path.join(source, "user-uploads", "linked"));
    fs.symlinkSync(outside, path.join(target, "generated"));
    const targetResult = invoke(["--source-assets", source, "--target", target]);
    assert.equal(targetResult.status, 2);
    assert.match(targetResult.stderr, /destination path contains a symlink/);
  });
});

test("runtime media sync documents source mutation protection", () => {
  const source = fs.readFileSync(script, "utf8");
  assert.match(source, /source file changed while copying/);
  assert.match(source, /staged file verification failed/);
  assert.match(source, /destination appeared before publish/);
});
