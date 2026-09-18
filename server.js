// Local HTTPS dev server for the Pangram Word add-in.
// Serves the task pane from ./src and ./assets, and runs the same proxy
// handlers (lib/pangram.mjs) that a hosted deployment uses.
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCertificates, verifyCertificates, isCaCertificateInstalled } from "office-addin-dev-certs";
import { handleStatus, handleAnalyze } from "./lib/pangram.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(ROOT, ".env");
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT || 3939);
const MAX_BODY = 5 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("Request body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Adapt node's IncomingMessage to a web Request so the shared handlers work here too.
async function callHandler(handler, req, res, url) {
  try {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const webReq = new Request(url, { method: req.method, headers: req.headers, body });
    const webRes = await handler(webReq);
    res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
    res.end(Buffer.from(await webRes.arrayBuffer()));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || String(e) });
  }
}

const API = {
  "GET /api/status": handleStatus,
  "POST /api/analyze": handleAnalyze,
};

function serveStatic(res, urlPath) {
  const clean = path.posix.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const rel = clean === "/" ? "/taskpane.html" : clean;
  const base = rel.startsWith("/assets/") ? ROOT : path.join(ROOT, "src");
  const file = path.join(base, rel);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, "Not found", "text/plain");
  }
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  send(res, 200, fs.readFileSync(file), type);
}

async function tlsOptions() {
  // Never install/trust the CA from here (that pops a keychain prompt and blocks);
  // `npm run certs` does it once. Here we only generate files if missing.
  const dir = path.join(os.homedir(), ".office-addin-dev-certs");
  const ca = path.join(dir, "ca.crt"), cert = path.join(dir, "localhost.crt"), key = path.join(dir, "localhost.key");
  if (!verifyCertificates(cert, key)) await generateCertificates(ca, cert, key, 3650);
  if (!isCaCertificateInstalled()) {
    console.warn("WARNING: the localhost dev certificate is not trusted yet, so Word will refuse to load the pane. Run `npm run certs` once.");
  }
  return { ca: fs.readFileSync(ca), cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
}

const tls = await tlsOptions();
https
  .createServer(tls, (req, res) => {
    const url = new URL(req.url, `https://localhost:${PORT}`);
    const handler = API[`${req.method} ${url.pathname}`];
    if (handler) return callHandler(handler, req, res, url);
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
    return serveStatic(res, url.pathname);
  })
  .on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Is another \`npm start\` running? Find it with: lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
      process.exit(1);
    }
    throw e;
  })
  .listen(PORT, () => {
    const keyed = process.env.PANGRAM_API_KEY ? "key from .env" : "NO KEY in .env (pane will ask for one)";
    console.log(`Pangram for Word: https://localhost:${PORT}/taskpane.html  [${keyed}]`);
  });
