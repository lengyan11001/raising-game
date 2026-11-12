const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server.parts", "part-01.js"), "utf8");

test("runtime media defaults to assets and may use an explicit shared root", () => {
  assert.match(source, /const RELEASE_ASSETS_ROOT = path\.join\(ROOT, "assets"\);/);
  assert.match(source, /const CONFIGURED_RUNTIME_MEDIA_ROOT = String\(process\.env\.RUNTIME_MEDIA_ROOT \|\| ""\)\.trim\(\);/);
  assert.match(source, /const RUNTIME_MEDIA_ROOT = CONFIGURED_RUNTIME_MEDIA_ROOT\s*\? path\.resolve\(CONFIGURED_RUNTIME_MEDIA_ROOT\)\s*: RELEASE_ASSETS_ROOT;/);
  assert.match(source, /const ASSETS_ROOT = RELEASE_ASSETS_ROOT;/);
  for (const name of [
    "USER_UPLOAD_DIR",
    "USER_CHARACTER_DIR",
    "ADMIN_HOME_DIR",
    "UNDRESS_TOOL_EXAMPLE_DIR",
    "ADMIN_ADVANCED_CASE_DIR",
    "ADMIN_PLATFORM_TEMPLATE_DIR",
    "GENERATED_VIDEO_DIR",
    "GENERATED_POSTER_DIR",
    "GENERATED_IMAGE_DIR",
    "GENERATED_LOCKED_PREVIEW_DIR",
    "GENERATED_CHARACTER_DIR",
  ]) {
    assert.match(source, new RegExp(`const ${name} = path\\.join\\(RUNTIME_MEDIA_ROOT,`), name);
  }
  assert.match(source, /const VIDEO_TOOL_UPLOAD_PART_DIR = path\.join\(RUNTIME_MEDIA_ROOT, "runtime-tmp", "video-tool-uploads"\);/);
});

test("asset URL resolution separates runtime media from release-owned assets", () => {
  assert.match(source, /const RUNTIME_MEDIA_URL_PREFIXES = Object\.freeze\(\[/);
  assert.match(source, /const root = runtimeRelative \? RUNTIME_MEDIA_ROOT : RELEASE_ASSETS_ROOT;/);
  assert.match(source, /return safePathWithin\(root, path\.resolve\(root, relative\)\);/);
});

test("documented runtime root does not replace PostgreSQL as the data authority", () => {
  const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(example, /^RUNTIME_MEDIA_ROOT=$/m);
  assert.match(example, /user uploads,\s*\n# generated media, admin media, and resumable upload parts all use this path;/);
  assert.doesNotMatch(example, /RUNTIME_MEDIA_ROOT=.*(DATABASE_URL|json)/i);
});

test("runtime media roots are exported for isolated startup verification", () => {
  const exportsSource = fs.readFileSync(path.join(root, "server.parts", "part-43.js"), "utf8");
  for (const name of [
    "safePathWithinAssetRoots",
    "safeAssetPathFromUrl",
    "resolveStaticFilePath",
    "ASSETS_ROOT",
    "RELEASE_ASSETS_ROOT",
    "RUNTIME_MEDIA_ROOT",
    "USER_UPLOAD_DIR",
    "USER_CHARACTER_DIR",
    "GENERATED_VIDEO_DIR",
    "VIDEO_TOOL_UPLOAD_PART_DIR",
  ]) {
    assert.match(exportsSource, new RegExp(`\\b${name}\\b`), name);
  }
});

test("server module honors RUNTIME_MEDIA_ROOT without changing asset URL semantics", () => {
  const os = require("node:os");
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), "raising-game-runtime-assets-"));
  const previous = process.env.RUNTIME_MEDIA_ROOT;
  try {
    process.env.RUNTIME_MEDIA_ROOT = shared;
    delete require.cache[require.resolve("../server")];
    const server = require("../server");
    assert.equal(server.ASSETS_ROOT, path.join(root, "assets"));
    assert.equal(server.RELEASE_ASSETS_ROOT, path.join(root, "assets"));
    assert.equal(server.RUNTIME_MEDIA_ROOT, path.resolve(shared));
    assert.equal(server.safeAssetPathFromUrl("/assets/brand/live-logo.png"), path.join(root, "assets", "brand", "live-logo.png"));
    assert.equal(server.USER_UPLOAD_DIR, path.join(path.resolve(shared), "user-uploads"));
    assert.equal(server.USER_CHARACTER_DIR, path.join(path.resolve(shared), "user-characters"));
    assert.equal(server.GENERATED_VIDEO_DIR, path.join(path.resolve(shared), "generated", "videos"));
    assert.equal(server.VIDEO_TOOL_UPLOAD_PART_DIR, path.join(path.resolve(shared), "runtime-tmp", "video-tool-uploads"));
    assert.equal(server.safeAssetPathFromUrl("/assets/user-uploads/a.png"), path.join(path.resolve(shared), "user-uploads", "a.png"));
    assert.equal(server.safeAssetPathFromUrl("/assets/generated/characters/aria360/portrait.png"), path.join(root, "assets", "generated", "characters", "aria360", "portrait.png"));
    assert.equal(server.safeAssetPathFromUrl("/assets/../server.parts/part-01.js"), "");
    assert.equal(server.safeAssetPathFromUrl("/assets/user-uploads/%2e%2e/server.parts/part-01.js"), "");
    assert.equal(server.safePathWithinAssetRoots(path.join(root, "assets", "brand", "live-logo.png")), path.join(root, "assets", "brand", "live-logo.png"));
    assert.equal(server.safePathWithinAssetRoots(path.join(path.resolve(shared), "user-uploads", "a.png")), path.join(path.resolve(shared), "user-uploads", "a.png"));
    assert.equal(server.safePathWithinAssetRoots(path.join(os.tmpdir(), "outside-runtime-media.png")), "");
    const sharedUpload = path.join(path.resolve(shared), "user-uploads", "a.png");
    fs.mkdirSync(path.dirname(sharedUpload), { recursive: true });
    fs.writeFileSync(sharedUpload, "shared");
    const resolvedShared = server.resolveStaticFilePath(root, "/assets/user-uploads/a.png");
    assert.equal(resolvedShared.filePath, sharedUpload);
    assert.equal(resolvedShared.root, path.resolve(shared));
    assert.equal(resolvedShared.runtimeMedia, true);
    const fallbackDefault = server.resolveStaticFilePath(root, "/assets/admin/home/default-hero.jpg");
    assert.equal(fallbackDefault.filePath, path.join(root, "assets", "admin", "home", "default-hero.jpg"));
    assert.equal(fallbackDefault.root, path.join(root, "assets"));
    assert.equal(fallbackDefault.runtimeMedia, true);
    const missingRuntime = server.resolveStaticFilePath(root, "/assets/user-uploads/missing.png");
    assert.equal(missingRuntime.filePath, path.join(path.resolve(shared), "user-uploads", "missing.png"));
    assert.equal(missingRuntime.root, path.resolve(shared));
    assert.equal(server.resolveStaticFilePath(root, "/assets/user-uploads/%2e%2e/server.parts/part-01.js").filePath, "");
  assert.equal(server.resolveStaticFilePath(root, "/assets/%2e%2e/server.parts/part-01.js").filePath, "");
  } finally {
    if (previous === undefined) delete process.env.RUNTIME_MEDIA_ROOT;
    else process.env.RUNTIME_MEDIA_ROOT = previous;
    delete require.cache[require.resolve("../server")];
    fs.rmSync(shared, { recursive: true, force: true });
  }
});

test("HTTP static serving reads shared runtime media and falls back to release defaults", async () => {
  const http = require("node:http");
  const os = require("node:os");
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), "raising-game-runtime-http-"));
  const previousRuntime = process.env.RUNTIME_MEDIA_ROOT;
  const previousR2 = process.env.DISABLE_R2_STORAGE;
  let serverModule;
  let server;
  let dbModule;
  let originalGetKv;
  try {
    const sharedFile = path.join(shared, "generated", "videos", "shared-runtime.jpg");
    fs.mkdirSync(path.dirname(sharedFile), { recursive: true });
    fs.writeFileSync(sharedFile, "shared-runtime-body");
    process.env.RUNTIME_MEDIA_ROOT = shared;
    process.env.DISABLE_R2_STORAGE = "1";
    process.env.GEO_VISIT_STATS_ENABLED = "0";
    process.env.DATABASE_URL = "";
    dbModule = require("../db");
    originalGetKv = dbModule.getKv;
    dbModule.getKv = async (key, fallback) => {
      assert.equal(key, "app_config");
      return structuredClone(fallback);
    };
    delete require.cache[require.resolve("../server")];
    serverModule = require("../server");
    server = serverModule.__httpServer;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    const request = (pathname) => new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: pathname, headers: { host: "localhost" }, agent: false }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on("error", reject);
      req.end();
    });

    const sharedResponse = await request("/assets/generated/videos/shared-runtime.jpg");
    assert.equal(sharedResponse.status, 200);
    assert.equal(sharedResponse.body.toString("utf8"), "shared-runtime-body");
    assert.match(sharedResponse.headers["content-type"] || "", /^image\/jpeg/);

    const fallbackResponse = await request("/assets/generated/characters/aria360/frame-0.png");
    assert.equal(fallbackResponse.status, 200);
    assert.ok(fallbackResponse.body.length > 1000);
    assert.match(fallbackResponse.headers["content-type"] || "", /^image\/png/);

    const traversalResponse = await request("/assets/admin/home/%2e%2e/%2e%2e/server.parts/part-01.js");
    assert.notEqual(traversalResponse.status, 200);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (serverModule) serverModule.__httpServer = null;
    if (dbModule && originalGetKv) dbModule.getKv = originalGetKv;
    if (previousRuntime === undefined) delete process.env.RUNTIME_MEDIA_ROOT;
    else process.env.RUNTIME_MEDIA_ROOT = previousRuntime;
    if (previousR2 === undefined) delete process.env.DISABLE_R2_STORAGE;
    else process.env.DISABLE_R2_STORAGE = previousR2;
    delete require.cache[require.resolve("../server")];
    fs.rmSync(shared, { recursive: true, force: true });
  }
});

test("runtime media serving fails clearly when PostgreSQL is unavailable", async () => {
  const http = require("node:http");
  const os = require("node:os");
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), "raising-game-runtime-db-fail-"));
  const previous = { ...process.env };
  let serverModule;
  let server;
  try {
    const sharedFile = path.join(shared, "generated", "videos", "db-fail.jpg");
    fs.mkdirSync(path.dirname(sharedFile), { recursive: true });
    fs.writeFileSync(sharedFile, "db-fail-body");
    process.env.RUNTIME_MEDIA_ROOT = shared;
    process.env.DISABLE_R2_STORAGE = "1";
    process.env.GEO_VISIT_STATS_ENABLED = "0";
    process.env.DATABASE_URL = "";
    delete require.cache[require.resolve("../server")];
    serverModule = require("../server");
    server = serverModule.__httpServer;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    const response = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/assets/generated/videos/db-fail.jpg", headers: { host: "localhost" }, agent: false }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(response.status, 500);
    assert.match(response.body.toString("utf8"), /DATABASE_URL is not configured/);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (serverModule) serverModule.__httpServer = null;
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
    delete require.cache[require.resolve("../server")];
    delete require.cache[require.resolve("../db")];
    fs.rmSync(shared, { recursive: true, force: true });
  }
});
