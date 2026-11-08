const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const remote = require("../server");
const { responseError } = require("../oss-storage");

test("public remote URL validation rejects local, private, credential-bearing, and mapped hosts", () => {
  const blocked = [
    "http://localhost/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://user:secret@8.8.8.8/",
  ];
  for (const url of blocked) {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) assert.equal(remote.isPrivateVegaHostname(parsed.hostname), false, url);
    else assert.equal(remote.isPrivateVegaHostname(parsed.hostname), true, url);
  }
  assert.equal(remote.isPrivateVegaHostname("8.8.8.8"), false);
  assert.equal(remote.isPrivateVegaHostname("example.com"), false);
});

test("remote downloader pins DNS and validates every redirect target", async () => {
  const dns = require("node:dns");
  const originalLookup = dns.promises.lookup;
  let currentLookup = originalLookup;
  const previousDnsLookup = require("node:dns").promises.lookup;
  const calls = [];
  dns.promises.lookup = async (hostname, options) => {
    calls.push(String(hostname));
    if (hostname === "public.example") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "private.example") return [{ address: "10.0.0.8", family: 4 }];
    return [{ address: "93.184.216.34", family: 4 }];
  };
  try {
    const resolved = await remote.resolvePublicRemoteUrl("https://public.example/image.png");
    assert.equal(resolved.addresses[0].address, "93.184.216.34");
    await assert.rejects(
      remote.resolvePublicRemoteUrl("https://user:secret@public.example/image.png"),
      (error) => error.code === "INVALID_REMOTE_MEDIA_URL" && error.statusCode === 400,
    );
    await assert.rejects(
      remote.resolvePublicRemoteUrl("https://private.example/image.png"),
      (error) => error.code === "INVALID_REMOTE_MEDIA_URL" && error.statusCode === 400,
    );
    assert.deepEqual(calls.slice(-2), ["public.example", "private.example"]);
  } finally {
    dns.promises.lookup = previousDnsLookup;
  }
});

test("streamed remote bodies abort once maxBytes is exceeded", async () => {
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(700));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    remote.readResponseBodyWithLimit(new Response(body), 1024, "test media"),
    (error) => error.statusCode === 400 && /too large/.test(error.message),
  );
  assert.equal(pulls, 2);
  assert.equal(cancelled, true);
});

test("object storage classifies permanent 4xx and retryable 429/5xx errors", () => {
  for (const status of [400, 401, 403, 404, 409, 412]) {
    const error = responseError("OSS PUT failed", { status }, "permanent");
    assert.equal(error.statusCode, status);
    assert.equal(error.upstreamStatus, status);
    assert.equal(error.retryable, false);
  }
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    const error = responseError("OSS PUT failed", { status }, "transient");
    assert.equal(error.statusCode, status);
    assert.equal(error.upstreamStatus, status);
    assert.equal(error.retryable, true);
  }
});


test("pinned HTTPS downloads keep hostname validation and SNI", () => {
  const source = read("server.parts/part-22.js");
  const request = source.slice(source.indexOf("async function requestPinnedPublicUrl"), source.indexOf("async function fetchPublicRemoteUrl"));
  assert.match(request, /servername: url\.protocol === "https:" \? url\.hostname : undefined/);
  assert.match(request, /hostname: selected\.address/);
  assert.match(request, /host: url\.host/);
});

test("malformed request URLs and JSON bodies are client errors", () => {
  const http = read("server.parts/part-42.js");
  const handler = http.slice(http.indexOf("async function handleRequest"), http.indexOf("async function handleRequest") + 900);
  assert.match(handler, /try \{\n    try \{\n      url = new URL\(req\.url/);
  assert.match(handler, /error\.statusCode = 400[\s\S]{0,100}error\.code = "MALFORMED_URL"/);
  assert.match(http, /error instanceof URIError/);
  assert.match(http, /path: url\?\.pathname \|\| req\.url \|\| ""/);

  const jsonSource = read("server.parts/part-24.js");
  const start = jsonSource.indexOf("async function readJson");
  const end = jsonSource.indexOf("function clampNumber", start);
  assert.ok(start >= 0 && end > start);
  const readJson = new Function("readRawBody", `${jsonSource.slice(start, end)}\nreturn readJson;`)(async () => "{bad json");
  return assert.rejects(readJson({}, 1024), (error) => error.statusCode === 400 && error.code === "INVALID_JSON");
});

test("poster maintenance reaches a bounded terminal state and is not rescanned", () => {
  const source = read("server.parts/part-21.js");
  const start = source.indexOf("function posterMaintenanceFailureUpdates");
  const end = source.indexOf("const generatedMediaMaintenanceQueue", start);
  assert.ok(start >= 0 && end > start);
  const helper = new Function("GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS", "GENERATION_POSTER_BACKFILL_RETRY_DELAY_MS", `
    ${source.slice(start, end)}
    return { posterMaintenanceFailureUpdates };
  `)(3, 1000);
  const second = helper.posterMaintenanceFailureUpdates(1, new Error("no frame"), 10000);
  assert.equal(second.posterMaintenanceAttempts, 2);
  assert.ok(second.posterMaintenanceRetryAt);
  assert.equal(second.posterMaintenanceTerminalAt, "");
  const terminal = helper.posterMaintenanceFailureUpdates(2, new Error("no frame"), 10000);
  assert.equal(terminal.posterMaintenanceAttempts, 3);
  assert.equal(terminal.posterMaintenanceRetryAt, "");
  assert.ok(terminal.posterMaintenanceTerminalAt);
  const needsPoster = source.slice(source.indexOf("function generationRecordNeedsPosterMaintenance"), source.indexOf("function generationRecordMaintenanceTarget"));
  assert.match(needsPoster, /posterMaintenanceTerminalAt/);

  const db = read("db.js");
  const query = db.slice(db.indexOf("async function getGenerationRecordsNeedingPosterMaintenanceFromDb"), db.indexOf("async function getGenerationRecordsNeedingR2RecoveryFromDb"));
  assert.match(query, /posterMaintenanceTerminalAt/);
  const scanner = read("server.parts/part-23.js");
  assert.match(scanner, /\.\.\.posterMaintenanceFailureUpdates\(previousAttempts, error, now\)/);
  assert.doesNotMatch(scanner, /posterMaintenanceRetryAt: retryAt/);
});

test("admin endpoints reject API tokens while retaining browser sessions and signed media", () => {
  const source = read("server.parts/part-12.js");
  const start = source.indexOf("async function requireAdmin");
  const end = source.indexOf("function makeUniquePaymentAmount", start);
  assert.ok(start >= 0 && end > start);
  const load = (auth) => new Function("requireUser", "sendJson", `${source.slice(start, end)}\nreturn requireAdmin;`)(
    async () => auth,
    (_res, status, body) => ({ status, body }),
  );
  return Promise.all([
    load({ user: { role: "admin" }, tokenSource: "api_token" })({}, {}).then((result) => {
      assert.equal(result, null);
    }),
    load({ user: { role: "admin" }, tokenSource: "subtoken" })({}, {}).then((result) => {
      assert.equal(result, null);
    }),
    load({ user: { role: "admin" }, tokenSource: "session" })({}, {}).then((result) => {
      assert.deepEqual(result.tokenSource, "session");
    }),
  ]).then(() => {
    const media = read("server.parts/part-41.js");
    assert.match(media, /if \(!tokenPayload\) \{\n    const auth = await requireAdmin/);
    assert.match(media, /parseAdminGenerationMediaToken/);
  });
});

test("primary API token is fetched explicitly and password resets keep browser sessions", () => {
  const part10 = read("server.parts/part-10.js");
  assert.match(part10, /apiToken: ""/);
  assert.match(part10, /apiTokenPreview:/);
  const routes = read("server.parts/part-42.js");
  assert.match(routes, /url\.pathname === "\/api\/access\/token"/);
  const tokens = read("server.parts/part-33.js");
  assert.match(tokens, /async function handleGetPrimaryApiToken/);
  assert.match(tokens, /cache-control", "no-store"/);
  const auth = read("server.parts/part-32.js");
  const reset = auth.match(/async function handlePasswordReset\(req, res\)[\s\S]*?\n}\r?\n\r?\nasync function handleAccountEmailRequest/);
  assert.ok(reset);
  assert.match(reset[0], /user\.apiToken = makeUniqueApiToken\(db\)/);
  assert.doesNotMatch(reset[0], /deleteUserSessionsInDb|db\.sessions =/);
});

test("double top-up claim is released when the credit grant fails", () => {
  const source = read("server.parts/part-13.js");
  const start = source.indexOf("async function releaseDoubleTopupClaim");
  const end = source.indexOf("async function applyDoubleTopupPromoSettlement", start);
  assert.ok(start >= 0 && end > start);
  const doubleTopupState = (user) => ({
    ...(user.doubleTopupPromo || {}),
    claimedOrderId: String(user.doubleTopupPromo?.claimedOrderId || ""),
    claimedAt: String(user.doubleTopupPromo?.claimedAt || ""),
  });
  const release = new Function("dbEnabled", "dbQuery", "getUserByIdInDb", "doubleTopupState", `
    ${source.slice(start, end)}
    return releaseDoubleTopupClaim;
  `)(() => false, async () => ({ rows: [] }), async () => null, doubleTopupState);
  const user = { id: "u-1", doubleTopupPromo: { claimedOrderId: "stripe-1", claimedAt: "2026-11-09T00:00:00.000Z" } };
  return release(user, "stripe-1").then((released) => {
    assert.equal(released, true);
    assert.equal(user.doubleTopupPromo.claimedOrderId || "", "");
    assert.equal(user.doubleTopupPromo.claimedAt || "", "");
    const settle = source.slice(source.indexOf("async function settleWalletOrderPayment"), source.indexOf("async function safeSettleWalletOrderPayment"));
    assert.match(settle, /catch \(error\) \{[\s\S]{0,300}releaseDoubleTopupClaim/);
  });
});

test("local asset path checks use real path boundaries and reject prefix siblings or symlink escapes", () => {
  const os = require("node:os");
  const fs = require("node:fs");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "raising-game-paths-"));
  const root = path.join(temp, "root");
  const outside = path.join(temp, "outside");
  fs.mkdirSync(path.join(root, "assets", "user-uploads"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(root, "assets", "user-uploads", "ok.png"), "ok");
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
  fs.symlinkSync(outside, path.join(root, "assets", "user-uploads", "escape"));
  try {
    assert.equal(remote.pathWithin(root, path.join(root, "assets", "ok.png")), true);
    assert.equal(remote.pathWithin(root, `${root}-backup/secret.txt`), false);
    assert.equal(remote.pathWithin(root, root), false);
    assert.equal(remote.safePathWithin(root, path.join(root, "assets", "user-uploads", "ok.png")), path.join(root, "assets", "user-uploads", "ok.png"));
    assert.equal(remote.safePathWithin(root, `${root}-backup/secret.txt`), "");
    assert.equal(remote.safePathWithin(root, path.join(root, "assets", "user-uploads", "escape", "secret.txt")), "");
    const normalAsset = path.join(root, "assets", "user-uploads", "ok.png");
    assert.equal(remote.safePathWithin(path.join(root, "assets"), normalAsset), normalAsset);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  assert.match(remote.safeAssetPathFromUrl("/assets/brand/favicon.svg"), /\/assets\/brand\/favicon\.svg$/);
  assert.equal(remote.safeAssetPathFromUrl("/assets/../server.parts/part-01.js"), "");
  assert.equal(remote.safeAssetPathFromUrl("/assets-backup/secret.txt"), "");
  assert.equal(remote.safeAssetPathFromUrl("/assets2/secret.txt"), "");
  const parts = [
    "server.parts/part-13.js",
    "server.parts/part-14.js",
    "server.parts/part-18.js",
    "server.parts/part-19.js",
    "server.parts/part-21.js",
    "server.parts/part-22.js",
    "server.parts/part-23.js",
    "server.parts/part-24.js",
    "server.parts/part-35.js",
    "server.parts/part-36.js",
    "server.parts/part-38.js",
    "server.parts/part-41.js",
  ];
  for (const file of parts) {
    const source = read(file);
    assert.doesNotMatch(source, /startsWith\(assetsRoot\)/, `${file} still has prefix-only asset checks`);
    assert.doesNotMatch(source, /if \(!localPath\.startsWith\(ROOT\)\)/, `${file} still has prefix-only root checks`);
  }
});

test("wallet settlement serializes same-user orders and uses targeted entitlement patches", () => {
  const source = read("server.parts/part-13.js");
  const settle = source.slice(source.indexOf("async function settleWalletOrderPayment("), source.indexOf("async function safeSettleWalletOrderPayment"));
  assert.match(settle, /withWalletOrderSettlementLockInDb\(order\.id/);
  assert.match(settle, /withWalletUserSettlementLockInDb\(currentOrder\.userId/);
  assert.ok(settle.indexOf("withWalletOrderSettlementLockInDb") < settle.indexOf("withWalletUserSettlementLockInDb"));
  assert.match(settle, /await getUserByIdInDb\(currentOrder\.userId\)/);
  const db = read("db.js");
  assert.match(db, /async function withWalletUserSettlementLockInDb/);
  assert.match(db, /wallet-user-settlement:\$\{id\}/);
  const entitlements = read("server.parts/part-03.js");
  assert.match(entitlements, /patchUserPayloadInDb\(user\.id, \{\s*membership: user\.membership/);
  assert.match(entitlements, /patchUserPayloadInDb\(user\.id, \{\s*apiDocsAccess: user\.apiDocsAccess/);
  assert.doesNotMatch(entitlements, /await updateUserInDb\(user\)/);
});

test("referral reward locks the referrer and reloads both users before granting", () => {
  const source = read("server.parts/part-11.js");
  const start = source.indexOf("async function maybeGrantReferralReward(");
  const end = source.indexOf("function maybeGrantReferralRewardInMemory", start);
  const reward = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(reward, /withUserMutationLockInDb\(referrerId/);
  assert.match(reward, /getUserByIdInDb\(cleanReferredUserId\)/);
  assert.match(reward, /referralRewardAlreadyGranted\(db, referrer\.id, referredUser\.id\)/);
  assert.match(reward, /patchUserPayloadInDb\(referredUser\.id, \{\s*referral: referredReferralPatch/);
  assert.doesNotMatch(reward, /updateUserInDb\(referredUser\)/);
});
