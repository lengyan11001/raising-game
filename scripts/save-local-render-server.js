const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "generated", "videos");
const PORT = Number(process.env.LOCAL_RENDER_PORT || 4175);

function safeName(name) {
  return String(name || "local-render.webm")
    .replace(/[^a-z0-9_.-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "http://127.0.0.1:4174");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST" || req.url.split("?")[0] !== "/save") {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, message: "Not found" }));
    return;
  }

  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const fileName = safeName(url.searchParams.get("name"));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (!body.length || body.length > 100 * 1024 * 1024) throw new Error("Invalid video body.");
    await fs.mkdir(OUT_DIR, { recursive: true });
    const filePath = path.join(OUT_DIR, fileName);
    await fs.writeFile(filePath, body);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      bytes: body.length,
      fileName,
      url: `/assets/generated/videos/${fileName}`,
      path: filePath,
    }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, message: error.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Local render save server: http://127.0.0.1:${PORT}/save`);
});
