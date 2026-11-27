"use strict";

const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const MODEL = "papaya-1.0";
const PREFIX = "/papaya/v1";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_FIELDS = [
  "messages", "tools", "tool_choice", "parallel_tool_calls", "temperature",
  "top_p", "stop", "response_format", "frequency_penalty", "presence_penalty",
];

function failure(status, code, message = code) {
  return Object.assign(new Error(message), { status, code });
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readPayload(req) {
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
    throw failure(413, "request_too_large");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw failure(413, "request_too_large");
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw failure(400, "invalid_json");
  }
  if (body?.model !== MODEL || !Array.isArray(body.messages) || !body.messages.length) {
    throw failure(400, "invalid_request", `Use model ${MODEL} and provide messages.`);
  }
  const maxTokens = body.max_completion_tokens ?? body.max_tokens ?? 8192;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
    throw failure(400, "invalid_max_tokens");
  }
  const stream = body.stream === true;
  return {
    ...Object.fromEntries(REQUEST_FIELDS.filter((key) => key in body).map((key) => [key, body[key]])),
    model: "carrothub-papaya-1.0",
    max_tokens: maxTokens,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
}

function upstreamFailure(status, payload) {
  if (status === 451 || Number(payload?.code) === 451 ||
      /security check/i.test(payload?.error?.message || payload?.message || "")) {
    return failure(451, "content_filtered");
  }
  if (status === 429) return failure(429, "upstream_rate_limited");
  if (status === 400 || status === 422) return failure(400, "upstream_rejected_request");
  return failure(502, "upstream_unavailable");
}

async function forwardStream(upstream, res, signal, record) {
  if (!upstream.headers.get("content-type")?.includes("text/event-stream")) {
    throw upstreamFailure(upstream.status, await upstream.json().catch(() => null));
  }
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
  });
  res.flushHeaders();
  const decoder = new TextDecoder();
  let pending = "";
  const forwardEvent = async (event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return false;
    if (data.trim() === "[DONE]") return true;
    const payload = JSON.parse(data);
    if (payload.error || Number(payload.code) >= 400) throw upstreamFailure(Number(payload.code), payload);
    if (payload.usage) record.usage = payload.usage;
    const encoded = JSON.stringify({ ...payload, ...(payload.model ? { model: MODEL } : {}) });
    if (!res.write(`data: ${encoded}\n\n`)) await once(res, "drain", { signal });
    return false;
  };
  for await (const chunk of upstream.body) {
    pending += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(pending))) {
      const event = pending.slice(0, boundary.index);
      pending = pending.slice(boundary.index + boundary[0].length);
      if (await forwardEvent(event)) return;
    }
    if (pending.length > MAX_BODY_BYTES) throw failure(502, "invalid_upstream_stream");
  }
  throw failure(502, "incomplete_upstream_stream");
}

function createPapayaGateway({ db, loadPricing, env = process.env, fetchUpstream = fetch }) {
  let active = 0;
  return async function papayaGateway(req, res, pathname) {
    const requestId = randomUUID();
    res.setHeader("x-request-id", requestId);
    res.setHeader("cache-control", "no-store");
    const controller = new AbortController();
    const onClose = () => controller.abort();
    res.once("close", onClose);
    let started = false;
    const record = { usage: null };
    let outcome = "failed";
    let held = false;
    let timer;
    const tokenCount = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
    try {
      const models = req.method === "GET" && pathname === `${PREFIX}/models`;
      const chat = req.method === "POST" && pathname === `${PREFIX}/chat/completions`;
      if (!models && !chat) throw failure(404, "not_found");
      const token = /^Bearer ([^\s]+)$/i.exec(String(req.headers.authorization || ""))?.[1];
      if (!token) throw failure(401, "invalid_api_key");
      if (!db.dbEnabled()) throw failure(503, "database_unavailable");
      const user = await db.getUserByApiTokenInDb(token).catch(() => {
        throw failure(503, "database_unavailable");
      });
      if (!user || user.riskStatus === "quarantined") throw failure(401, "invalid_api_key");
      if (models) {
        return json(res, 200, { object: "list", data: [{ id: MODEL, object: "model", owned_by: "123vips" }] });
      }
      const key = (env.PAPAYA_GATEWAY_API_KEY || env.MULEROUTER_API_KEY || "").trim();
      if (!key) throw failure(503, "upstream_unavailable");
      const payload = await readPayload(req);
      if (controller.signal.aborted) return;
      if (active >= 2) throw failure(429, "gateway_busy");
      active += 1;
      held = true;
      const price = await loadPricing(user).catch(() => { throw failure(503, "billing_unavailable"); });
      const inputEstimate = Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 2);
      if (Number(user.credits) <= 0 || Number(user.credits) < price(inputEstimate, payload.max_tokens)) {
        throw failure(402, "insufficient_credits", "Top up your 123vips credits and try again.");
      }
      await db.query(
        "INSERT INTO app_papaya_requests (id, user_id, streamed) VALUES ($1, $2, $3)",
        [requestId, user.id, payload.stream],
      ).catch(() => { throw failure(503, "database_unavailable"); });
      started = true;
      const base = (env.PAPAYA_GATEWAY_API_BASE || env.MULEROUTER_API_BASE || "https://api.mulerouter.ai")
        .trim().replace(/\/+$/, "");
      const timeout = AbortSignal.timeout(180_000);
      timer = AbortSignal.any([controller.signal, timeout]);
      let result;
      try {
        const upstream = await fetchUpstream(`${base}/vendors/openai/v1/chat/completions`, {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            accept: payload.stream ? "text/event-stream" : "application/json",
          },
          body: JSON.stringify(payload),
          signal: timer,
        });
        if (!upstream.ok) throw upstreamFailure(upstream.status, await upstream.json().catch(() => null));
        if (payload.stream) {
          await forwardStream(upstream, res, timer, record);
        } else {
          result = await upstream.json();
          if (!Array.isArray(result?.choices) || result.error || Number(result.code) >= 400) {
            throw upstreamFailure(upstream.status, result);
          }
          record.usage = result.usage;
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (timeout.aborted) throw failure(504, "upstream_timeout");
        throw error.status ? error : failure(502, "upstream_unavailable");
      }
      const promptTokens = tokenCount(record.usage?.prompt_tokens);
      const completionTokens = tokenCount(record.usage?.completion_tokens);
      if (promptTokens === null || completionTokens === null || promptTokens === 0) {
        throw failure(502, "upstream_usage_missing");
      }
      const cost = price(promptTokens, completionTokens);
      if (cost > 0) {
        try {
          const charge = await db.applyCreditDeltaInDb({
            id: `papaya-gateway:${requestId}`,
            userId: user.id,
            delta: -cost,
            type: "papaya_gateway_usage",
            meta: { taskId: requestId, model: MODEL, promptTokens, completionTokens },
          });
          if (!charge?.ledger) throw failure(503, "billing_unavailable");
        } catch (error) {
          if (error.statusCode === 402) {
            throw failure(402, "insufficient_credits", "Top up your 123vips credits and try again.");
          }
          throw failure(503, "billing_unavailable");
        }
      }
      outcome = "completed";
      await finish(outcome).catch(() => { throw failure(503, "database_unavailable"); });
      if (payload.stream) res.end("data: [DONE]\n\n");
      else json(res, 200, { ...result, model: MODEL });
    } catch (error) {
      if (outcome !== "completed") outcome = controller.signal.aborted ? "disconnected" : "failed";
      if (!res.destroyed) {
        const code = error.code && error.status ? error.code : "internal_error";
        const payload = { error: { message: error.status ? error.message : code, type: code, code } };
        if (res.headersSent) res.end(`data: ${JSON.stringify(payload)}\n\n`);
        else json(res, error.status || 500, payload);
      }
    } finally {
      res.off("close", onClose);
      controller.abort();
      if (held) active -= 1;
      if (started) {
        await finish(outcome).catch(() => console.warn("Papaya request accounting failed", requestId));
      }
    }

    async function finish(status) {
      await db.query(
        `UPDATE app_papaya_requests
         SET outcome = $2, prompt_tokens = $3, completion_tokens = $4, finished_at = NOW()
         WHERE id = $1 AND finished_at IS NULL`,
        [requestId, status, tokenCount(record.usage?.prompt_tokens), tokenCount(record.usage?.completion_tokens)],
      );
      started = false;
    }
  };
}

module.exports = { PREFIX, createPapayaGateway };
