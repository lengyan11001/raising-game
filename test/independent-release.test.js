const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "ops", "prepare-independent-release.sh");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("independent release builder rejects missing arguments and unsafe targets", () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "rg-release-source-"));
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), "rg-release-assets-"));
  try {
    git(source, "init", "-q");
    git(source, "config", "user.email", "test@example.invalid");
    git(source, "config", "user.name", "Test");
    fs.writeFileSync(path.join(source, "server.js"), "console.log('ok');\n");
    git(source, "add", "server.js");
    git(source, "commit", "-qm", "fixture");
    const existing = path.join(source, "candidate");
    fs.mkdirSync(existing);
    const result = spawnSync(script, [source, existing, shared], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /already exists|Target release already exists/);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(shared, { recursive: true, force: true });
  }
});

test("independent release contains only the committed tree plus provenance markers", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rg-independent-release-"));
  const source = path.join(temp, "source");
  const shared = path.join(temp, "shared-assets");
  const candidate = path.join(temp, "candidate");
  try {
    fs.mkdirSync(shared);
    fs.mkdirSync(source);
    git(source, "init", "-q");
    git(source, "config", "user.email", "test@example.invalid");
    git(source, "config", "user.name", "Test");
    fs.writeFileSync(path.join(source, "server.js"), "console.log('ok');\n");
    git(source, "add", "server.js");
    git(source, "commit", "-qm", "fixture");
    const commit = git(source, "rev-parse", "HEAD");
    const output = execFileSync(script, [source, candidate, shared], { encoding: "utf8" });
    assert.match(output, /INDEPENDENT_RELEASE_READY=1/);
    assert.equal(fs.readFileSync(path.join(candidate, "RELEASE_COMMIT"), "utf8").trim(), commit);
    assert.equal(fs.readFileSync(path.join(candidate, "RUNTIME_MEDIA_ROOT"), "utf8").trim(), fs.realpathSync(shared));
    assert.equal(fs.existsSync(path.join(candidate, "server.js")), true);
    assert.equal(fs.existsSync(path.join(candidate, "assets")), false);
  } finally {
    fs.chmodSync(temp, 0o755);
    if (fs.existsSync(candidate)) fs.chmodSync(candidate, 0o755);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("independent release builder refuses a dirty checkout", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rg-dirty-release-"));
  const source = path.join(temp, "source");
  const shared = path.join(temp, "shared-assets");
  const candidate = path.join(temp, "candidate");
  try {
    fs.mkdirSync(shared);
    fs.mkdirSync(source);
    git(source, "init", "-q");
    git(source, "config", "user.email", "test@example.invalid");
    git(source, "config", "user.name", "Test");
    fs.writeFileSync(path.join(source, "server.js"), "console.log('ok');\n");
    git(source, "add", "server.js");
    git(source, "commit", "-qm", "fixture");
    fs.writeFileSync(path.join(source, "server.js"), "console.log('dirty');\n");
    const result = spawnSync(script, [source, candidate, shared], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Refusing to snapshot a dirty source checkout/);
    assert.equal(fs.existsSync(candidate), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
