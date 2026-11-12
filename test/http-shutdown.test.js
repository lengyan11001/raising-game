"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const test = require("node:test");

const {
  closeHttpServerBounded,
  createHttpShutdownGate,
  createHttpSocketTracker,
} = require("../http-shutdown");

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    port: server.address().port,
    close: () => closeHttpServerBounded(server, { graceMs: 1000, settleMs: 250 }),
  };
}

function request(port, { method = "GET", path = "/", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers, agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("shutdown gate rejects new business requests but keeps probes available", async () => {
  const gate = createHttpShutdownGate();
  assert.equal(gate.shouldReject({ method: "POST", url: "/api/generation-records" }), false);
  gate.begin();
  assert.equal(gate.shouldReject({ method: "GET", url: "/api/readyz" }), false);
  assert.equal(gate.shouldReject({ method: "GET", url: "/api/health" }), false);
  assert.equal(gate.shouldReject({ method: "POST", url: "/api/generation-records" }), true);
  assert.equal(gate.shouldReject({ method: "GET", url: "/api/config" }), true);

  const headers = new Map();
  let body = "";
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = "") { body += String(value); },
  };
  gate.reject({ method: "POST", resume() {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(headers.get("connection"), "close");
  assert.equal(headers.get("retry-after"), "5");
  assert.equal(JSON.parse(body).code, "SERVER_SHUTTING_DOWN");
});

test("bounded HTTP close does not wait for an idle keep-alive connection", async () => {
  const instance = await startServer((_req, res) => res.end("ok"));
  const tracker = createHttpSocketTracker(instance.server);
  await request(instance.port);
  const startedAt = Date.now();
  const result = await closeHttpServerBounded(instance.server, {
    socketTracker: tracker,
    graceMs: 1000,
    settleMs: 250,
  });
  assert.equal(result.forced, false);
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(tracker.size, 0);
});

test("bounded HTTP close forcibly removes a connection that keeps sending requests", async () => {
  const instance = await startServer((_req, res) => {
    setTimeout(() => {
      if (!res.destroyed) res.end("late");
    }, 5000);
  });
  const tracker = createHttpSocketTracker(instance.server);
  const req = http.request({ host: "127.0.0.1", port: instance.port, path: "/slow", agent: false });
  req.on("error", () => {});
  req.end();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const startedAt = Date.now();
  const result = await closeHttpServerBounded(instance.server, {
    socketTracker: tracker,
    graceMs: 100,
    settleMs: 100,
  });
  assert.equal(result.forced, true);
  assert.ok(result.remainingSockets >= 1);
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(tracker.size, 0);
});

test("bounded HTTP close destroys a WebSocket-like upgraded socket", async () => {
  const server = http.createServer();
  server.on("upgrade", (_req, socket) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const tracker = createHttpSocketTracker(server);
  const socket = net.connect(server.address().port, "127.0.0.1");
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
    socket.write("GET /api/chat-live/ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const result = await closeHttpServerBounded(server, {
    socketTracker: tracker,
    graceMs: 100,
    settleMs: 100,
  });
  assert.equal(result.forced, true);
  assert.equal(tracker.size, 0);
  socket.destroy();
});

test("shutdown of an already idle server completes without force closing", async () => {
  const instance = await startServer((_req, res) => res.end("ok"));
  const result = await closeHttpServerBounded(instance.server, { graceMs: 100, settleMs: 100 });
  assert.equal(result.forced, false);
  assert.equal(result.remainingSockets, 0);
});
