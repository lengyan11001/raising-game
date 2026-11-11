"use strict";

const DEFAULT_PROBE_PATHS = Object.freeze(["/api/health", "/api/livez", "/api/readyz"]);

function requestPath(req) {
  try {
    return new URL(String(req?.url || "/"), "http://localhost").pathname;
  } catch {
    return "";
  }
}

function createHttpShutdownGate({ probePaths = DEFAULT_PROBE_PATHS } = {}) {
  const probes = new Set(probePaths);
  let stopping = false;

  return {
    get stopping() {
      return stopping;
    },
    begin() {
      stopping = true;
    },
    shouldReject(req) {
      if (!stopping) return false;
      const method = String(req?.method || "GET").toUpperCase();
      const pathname = requestPath(req);
      return !((method === "GET" || method === "HEAD") && probes.has(pathname));
    },
    reject(req, res) {
      try { req?.resume?.(); } catch {}
      res.statusCode = 503;
      res.setHeader("Connection", "close");
      res.setHeader("Retry-After", "5");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({
        ok: false,
        code: "SERVER_SHUTTING_DOWN",
        message: "Server is restarting. Retry shortly.",
      }));
    },
    rejectUpgrade(socket) {
      if (!socket || socket.destroyed) return;
      const body = JSON.stringify({
        ok: false,
        code: "SERVER_SHUTTING_DOWN",
        message: "Server is restarting. Retry shortly.",
      });
      socket.end([
        "HTTP/1.1 503 Service Unavailable",
        "Connection: close",
        "Retry-After: 5",
        "Content-Type: application/json; charset=utf-8",
        "Cache-Control: no-store",
        `Content-Length: ${Buffer.byteLength(body)}`,
        "",
        body,
      ].join("\r\n"));
    },
  };
}

function createHttpSocketTracker(server) {
  const sockets = new Set();
  const onConnection = (socket) => {
    sockets.add(socket);
    const forget = () => sockets.delete(socket);
    socket.once("close", forget);
    socket.once("error", forget);
  };
  server.on("connection", onConnection);

  return {
    get size() {
      return sockets.size;
    },
    sockets,
    closeAll() {
      for (const socket of sockets) {
        try {
          socket.destroy();
        } catch {}
      }
      sockets.clear();
    },
    stopTracking() {
      server.off("connection", onConnection);
    },
  };
}

function delay(ms) {
  let timer;
  const promise = new Promise((resolve) => {
    timer = setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
  promise.cancel = () => clearTimeout(timer);
  return promise;
}

async function raceWithTimeout(promise, timeoutMs) {
  const timeout = delay(timeoutMs);
  try {
    return await Promise.race([
      promise.then((value) => ({ completed: true, value })),
      timeout.then(() => ({ completed: false })),
    ]);
  } finally {
    timeout.cancel();
  }
}

async function closeHttpServerBounded(server, {
  socketTracker,
  graceMs = 30000,
  settleMs = 1000,
} = {}) {
  const startedAt = Date.now();
  let closed = false;
  const closedPromise = new Promise((resolve) => {
    server.close(() => {
      closed = true;
      resolve();
    });
  });
  server.closeIdleConnections?.();
  await raceWithTimeout(closedPromise, graceMs);
  if (closed) {
    socketTracker?.stopTracking();
    return {
      forced: false,
      elapsedMs: Date.now() - startedAt,
      remainingSockets: socketTracker?.size || 0,
    };
  }

  const remainingSockets = socketTracker?.size || 0;
  server.closeAllConnections?.();
  socketTracker?.closeAll();
  await raceWithTimeout(closedPromise, settleMs);
  socketTracker?.stopTracking();
  return {
    forced: true,
    elapsedMs: Date.now() - startedAt,
    remainingSockets,
  };
}

module.exports = {
  DEFAULT_PROBE_PATHS,
  closeHttpServerBounded,
  createHttpShutdownGate,
  createHttpSocketTracker,
};
