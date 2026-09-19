// Framework-agnostic proxy for the Pangram text-detection API.
// Used by the local dev server (scripts/dev-server.mjs) and the hosted deployment (api/*.js);
// both speak web-standard Request/Response.
//
// Pangram's API sends no CORS headers, so the Word task pane calls one of
// these handlers instead. By default the API key must come from the request's
// x-api-key header (each user's own key). Falling back to PANGRAM_API_KEY from
// the environment is opt-in via { allowServerKey: true } and is meant only for
// the local server: on a public host it would let anyone spend those credits.

const PANGRAM_BASE = "https://text.external-api.pangram.com";
const POLL_MS = 1000;
const POLL_TIMEOUT_MS = 110_000;
const MAX_CHARS = 2_000_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MODEL_CACHE_MS = 10 * 60_000;

export class PangramError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function resolveKey(req, { allowServerKey = false } = {}) {
  const fromClient = req.headers.get("x-api-key")?.trim();
  const key = fromClient || (allowServerKey ? process.env.PANGRAM_API_KEY : undefined);
  if (!key) throw new PangramError(401, "No Pangram API key. Paste your key in the pane's settings.");
  return key;
}

async function pangram(apiKey, method, route, body) {
  const r = await fetch(PANGRAM_BASE + route, {
    method,
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!r.ok) {
    const detail = json?.detail ?? json?.message ?? text ?? r.statusText;
    throw new PangramError(r.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return json;
}

const modelCache = new Map(); // apiKey -> { models, at }
export async function listModels(apiKey) {
  const hit = modelCache.get(apiKey);
  if (hit && Date.now() - hit.at < MODEL_CACHE_MS) return hit.models;
  const { models = [] } = await pangram(apiKey, "GET", "/models");
  modelCache.set(apiKey, { models, at: Date.now() });
  return models;
}

export async function pickModel(apiKey, requested) {
  if (requested) return requested;
  if (process.env.PANGRAM_MODEL) return process.env.PANGRAM_MODEL;
  try {
    const models = await listModels(apiKey);
    const p4 = models.find((m) => /^pangram-4/.test(m));
    return p4 || (models.includes("default") ? "default" : models[0] || "default");
  } catch (e) {
    if (e instanceof PangramError && e.status === 401) throw e;
    return "default";
  }
}

export async function analyze(apiKey, text, model) {
  const { task_id } = await pangram(apiKey, "POST", "/task", {
    text,
    model,
    public_dashboard_link: true,
  });
  if (!task_id) throw new PangramError(502, "Pangram did not return a task_id");
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const status = await pangram(apiKey, "GET", `/task/${encodeURIComponent(task_id)}`);
    if (status.stage === "STAGE_SUCCESS") return { ...status, model, task_id };
    if (status.stage === "STAGE_FAILED") {
      throw new PangramError(422, status.headline || "Pangram could not analyze this text");
    }
  }
  throw new PangramError(504, "Timed out waiting for Pangram to finish");
}

const NO_STORE = { "Cache-Control": "no-store" };
const json = (data, status = 200) => Response.json(data, { status, headers: NO_STORE });

export function errorResponse(e) {
  const status = e instanceof PangramError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  if (status >= 500) console.error("[pangram proxy]", e);
  return json({ error: message }, status);
}

/** GET handler: reports whether a server key exists, whether the effective key works, and the model list. */
export async function handleStatus(req, opts = {}) {
  const hasServerKey = Boolean(opts.allowServerKey && process.env.PANGRAM_API_KEY);
  const hasAnyKey = hasServerKey || Boolean(req.headers.get("x-api-key")?.trim());
  if (!hasAnyKey) return json({ hasServerKey, keyOk: null, models: [] });
  let models = [];
  let keyOk = null;
  try {
    models = await listModels(resolveKey(req, opts));
    keyOk = true;
  } catch (e) {
    keyOk = e instanceof PangramError && e.status === 401 ? false : null;
  }
  return json({ hasServerKey, keyOk, models });
}

/** POST handler: body {text, model?} -> completed Pangram result. */
export async function handleAnalyze(req, opts = {}) {
  try {
    const apiKey = resolveKey(req, opts);
    if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
      throw new PangramError(413, "Document is too large to analyze.");
    }
    const body = await req.json().catch(() => { throw new PangramError(400, "Invalid JSON body"); });
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) throw new PangramError(400, "The document has no text to analyze.");
    if (text.length > MAX_CHARS) throw new PangramError(413, "Document is too large to analyze.");
    const model = await pickModel(apiKey, typeof body?.model === "string" ? body.model : undefined);
    return json(await analyze(apiKey, text, model));
  } catch (e) {
    return errorResponse(e);
  }
}
