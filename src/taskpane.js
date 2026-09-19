/* Pangram for Word — task pane logic. Plain JS, no build step. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    refresh: $("btn-refresh"),
    settingsBtn: $("btn-settings"),
    settings: $("settings"),
    apiKey: $("api-key"),
    saveKey: $("btn-save-key"),
    settingsHint: $("settings-hint"),
    verdict: $("verdict"),
    verdictText: $("verdict-text"),
    scanned: $("scanned"),
    modelVersion: $("model-version"),
    dialWrap: document.querySelector(".dial-wrap"),
    track: $("dial-track"),
    segAi: $("seg-ai"),
    segAssisted: $("seg-assisted"),
    segHuman: $("seg-human"),
    number: $("dial-number"),
    caption: $("dial-caption"),
    legend: $("legend"),
    pctAi: $("pct-ai"),
    pctAssisted: $("pct-assisted"),
    pctHuman: $("pct-human"),
    legendAssisted: $("legend-assisted"),
    status: $("status"),
    analyze: $("btn-analyze"),
    full: $("btn-full"),
    meta: $("meta"),
  };

  const params = new URLSearchParams(location.search);
  const MOCK = params.get("mock") === "1";
  const KEY_STORAGE = "pangram:apiKey";
  const RESULT_STORAGE_PREFIX = "pangram:last:";

  let docId = "unknown";
  let lastResult = null;   // result currently shown (null when the gauge is empty)
  let storedResult = null; // last successful result for this document, shown only while the text still matches
  let busy = false;
  let hasServerKey = false;
  let staleTimer = null;

  // FNV-1a 32-bit; enough to notice that the document text changed.
  const hashText = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  };

  // ---------- ring gauge geometry ----------
  // Open ring in a 200x200 box: SPAN degrees of arc, gap centred at the bottom.
  const CX = 100, CY = 100, R = 88, SPAN = 290;
  const START = 180 + (360 - SPAN) / 2; // degrees clockwise from 12 o'clock
  const GAP = 0.012;                    // fraction of the ring left blank between segments
  const pointAt = (t) => {
    const a = ((START + SPAN * t) * Math.PI) / 180;
    return [CX + R * Math.sin(a), CY - R * Math.cos(a)];
  };
  const arcPath = (t0, t1) => {
    if (t1 - t0 <= 0) return "";
    const [x0, y0] = pointAt(t0);
    const [x1, y1] = pointAt(t1);
    const large = (t1 - t0) * SPAN > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  el.track.setAttribute("d", arcPath(0, 1));

  // Draws consecutive segments [ai, assisted, human] (fractions summing to ~1)
  // with a small gap between non-empty neighbours.
  function setRing(parts) {
    const targets = [el.segAi, el.segAssisted, el.segHuman];
    const nonEmpty = parts.map((f) => f > 0.0005);
    let cursor = 0;
    parts.forEach((f, i) => {
      let t0 = cursor, t1 = cursor + f;
      cursor = t1;
      if (!nonEmpty[i]) { targets[i].setAttribute("d", ""); return; }
      const prev = nonEmpty.slice(0, i).some(Boolean);
      const next = nonEmpty.slice(i + 1).some(Boolean);
      if (prev) t0 += GAP / 2;
      if (next) t1 -= GAP / 2;
      // Keep a visible dot for tiny segments (round caps need a non-zero length).
      if (t1 - t0 < 0.003) t1 = t0 + 0.003;
      targets[i].setAttribute("d", arcPath(Math.max(0, t0), Math.min(1, t1)));
    });
  }
  const clearRing = () => [el.segAi, el.segAssisted, el.segHuman].forEach((p) => p.setAttribute("d", ""));

  // ---------- helpers ----------
  const pctOf = (f) => Math.round((Number(f) || 0) * 100);
  const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;
  const ago = (ts) => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(ts).toLocaleDateString();
  };
  const setStatus = (msg, isError = false) => {
    el.status.textContent = msg || "";
    el.status.classList.toggle("error", isError);
  };
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const clientKey = () => (storage.get(KEY_STORAGE) || "").trim();

  function verdictClass(r) {
    const short = String(r.prediction_short || "").toLowerCase();
    if (short.startsWith("ai")) return "verdict-ai";
    if (short.startsWith("mix")) return "verdict-mixed";
    if (short.startsWith("human")) return "verdict-human";
    const ai = pctOf(r.fraction_ai) + pctOf(r.fraction_ai_assisted);
    return ai >= 50 ? "verdict-ai" : ai >= 20 ? "verdict-mixed" : "verdict-human";
  }
  function verdictLabel(r) {
    if (r.headline) return r.headline;
    const short = String(r.prediction_short || "").toLowerCase();
    if (short.startsWith("ai")) return "AI Detected";
    if (short.startsWith("mix")) return "AI Assisted";
    if (short.startsWith("human")) return "Human Written";
    return "Analyzed";
  }

  // ---------- rendering ----------
  function render(r) {
    lastResult = r;
    const ai = pctOf(r.fraction_ai);
    const assisted = pctOf(r.fraction_ai_assisted);
    const human = Math.max(0, 100 - ai - assisted);
    const nonHuman = Math.min(100, ai + assisted);

    el.verdict.className = `verdict ${verdictClass(r)}`;
    el.verdictText.textContent = verdictLabel(r);
    el.scanned.textContent = r.words ? `${r.words.toLocaleString()} words scanned` : "";
    el.modelVersion.textContent = r.version || "";

    setRing([ai / 100, assisted / 100, human / 100]);
    el.number.innerHTML = `${nonHuman}<span class="pct">%</span>`;
    el.caption.textContent = assisted > 0 ? "of this text is AI or AI-assisted" : "of this text is AI";

    el.legend.hidden = false;
    el.pctAi.textContent = `${ai}%`;
    el.pctAssisted.textContent = `${assisted}%`;
    el.pctHuman.textContent = `${human}%`;
    el.legendAssisted.hidden = assisted === 0;

    setStatus(r.prediction || "");

    el.full.hidden = !r.dashboard_link;
    el.analyze.textContent = "Run again";
    el.meta.textContent = `Analyzed ${ago(r.at || Date.now())}`;
  }

  function renderEmpty(msg) {
    lastResult = null;
    el.verdict.className = "verdict verdict-idle";
    el.verdictText.textContent = "Not analyzed";
    el.scanned.textContent = "Click Analyze to score this document";
    el.modelVersion.textContent = "";
    clearRing();
    el.number.innerHTML = '<span class="dial-dash">—</span>';
    el.caption.textContent = "of this text is AI";
    el.legend.hidden = true;
    el.full.hidden = true;
    el.analyze.textContent = "Analyze document";
    el.meta.textContent = "";
    setStatus(msg || "");
  }

  function setBusy(on) {
    busy = on;
    el.dialWrap.classList.toggle("busy", on);
    el.refresh.classList.toggle("spinning", on);
    el.refresh.disabled = on;
    el.analyze.disabled = on;
    if (on) {
      clearRing();
      el.number.innerHTML = '<span class="dial-dash">…</span>';
    }
  }

  // ---------- Word ----------
  async function readDocumentText() {
    if (MOCK) return MOCK_TEXT;
    return Word.run(async (context) => {
      const body = context.document.body;
      body.load("text");
      await context.sync();
      return body.text || "";
    });
  }

  // Compare the live document with the stored result; show the score only while they match.
  async function checkStale() {
    if (busy || !storedResult?.textHash) return;
    let text;
    try { text = await readDocumentText(); } catch { return; }
    const same = hashText(text) === storedResult.textHash;
    if (same && !lastResult) {
      render(storedResult);
    } else if (!same && lastResult) {
      renderEmpty("The document changed since the last analysis. Run again to rescore.");
    }
  }
  const scheduleStaleCheck = () => {
    clearTimeout(staleTimer);
    staleTimer = setTimeout(checkStale, 800);
  };

  function openExternal(url) {
    try { if (new URL(url).protocol !== "https:") return; } catch { return; }
    try {
      if (typeof Office !== "undefined" && Office.context?.ui?.openBrowserWindow &&
          Office.context.requirements?.isSetSupported?.("OpenBrowserWindowApi", "1.1")) {
        Office.context.ui.openBrowserWindow(url);
        return;
      }
    } catch { /* fall through */ }
    window.open(url, "_blank", "noopener");
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const key = clientKey();
    if (key) headers["x-api-key"] = key;
    // Relative to the pane's own URL, so the same files work at / (local) or /pangram/ (hosted).
    const r = await fetch(new URL(path, location.href), { ...opts, headers });
    let data = null;
    try { data = await r.json(); } catch { /* no body */ }
    if (!r.ok) {
      const err = new Error(data?.error || `Request failed (${r.status})`);
      err.status = r.status;
      throw err;
    }
    return data;
  }

  async function checkKey() {
    if (MOCK) { hasServerKey = true; return; }
    try {
      const s = await api("api/status");
      hasServerKey = Boolean(s.hasServerKey);
      if (!hasServerKey && !clientKey()) {
        el.settings.hidden = false;
        el.settingsHint.textContent = "No key on the server. Paste your Pangram API key to get started.";
        el.settingsHint.classList.remove("error");
      } else if (s.keyOk === false) {
        el.settings.hidden = false;
        el.settingsHint.textContent = clientKey()
          ? "That key was rejected by Pangram. Paste a valid key."
          : "The key in .env was rejected by Pangram. Paste a valid key here or fix .env.";
        el.settingsHint.classList.add("error");
      }
    } catch (e) {
      if (e.status === 401) {
        el.settings.hidden = false;
        el.settingsHint.textContent = e.message;
        el.settingsHint.classList.add("error");
      } else {
        setStatus("Can't reach the local Pangram server. Is `npm start` running?", true);
      }
    }
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setStatus("Reading document…");
    try {
      const text = await readDocumentText();
      const words = wordCount(text);
      if (!words) {
        setBusy(false);
        renderEmpty("The document is empty. Add some text and run again.");
        return;
      }
      setStatus(`Analyzing ${words.toLocaleString()} words with Pangram…`);
      const result = MOCK ? await mockAnalyze() : await api("api/analyze", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      result.at = Date.now();
      result.words = words;
      result.textHash = hashText(text);
      delete result.text; // don't cache the full document
      delete result.windows;
      storedResult = result;
      storage.set(RESULT_STORAGE_PREFIX + docId, JSON.stringify(result));
      setBusy(false);
      render(result);
    } catch (e) {
      setBusy(false);
      if (lastResult) render(lastResult); else renderEmpty("");
      const msg = e.status === 402
        ? "Your Pangram account has no API credits. Add credits in the Pangram dashboard, then run again."
        : e.message || "Something went wrong.";
      setStatus(msg, true);
      if (e.status === 401) { el.settings.hidden = false; el.apiKey.focus(); }
    }
  }

  // ---------- events ----------
  el.analyze.addEventListener("click", run);
  el.refresh.addEventListener("click", run);
  el.full.addEventListener("click", () => lastResult?.dashboard_link && openExternal(lastResult.dashboard_link));
  el.settingsBtn.addEventListener("click", () => {
    el.settings.hidden = !el.settings.hidden;
    if (!el.settings.hidden) el.apiKey.focus();
  });
  el.saveKey.addEventListener("click", async () => {
    const v = el.apiKey.value.trim();
    if (v) storage.set(KEY_STORAGE, v); else storage.del(KEY_STORAGE);
    el.settingsHint.classList.remove("error");
    el.settingsHint.textContent = v ? "Key saved. Checking…" : "Key cleared. Using the server's .env key if present.";
    try {
      const s = await api("api/status");
      if (s.keyOk === false) {
        el.settingsHint.textContent = "Pangram rejected that key.";
        el.settingsHint.classList.add("error");
      } else {
        el.settingsHint.textContent = v ? "Key accepted." : el.settingsHint.textContent;
        setTimeout(() => { el.settings.hidden = true; }, 700);
      }
    } catch (e) {
      el.settingsHint.textContent = e.message;
      el.settingsHint.classList.add("error");
    }
  });
  el.apiKey.addEventListener("keydown", (e) => { if (e.key === "Enter") el.saveKey.click(); });

  // ---------- theme ----------
  function applyOfficeTheme() {
    try {
      const bg = Office.context?.officeTheme?.bodyBackgroundColor;
      if (!bg) return;
      const n = parseInt(bg.replace("#", ""), 16);
      const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
      document.documentElement.dataset.theme = lum < 128 ? "dark" : "light";
    } catch { /* keep prefers-color-scheme */ }
  }

  // ---------- boot ----------
  async function boot() {
    el.apiKey.value = clientKey();
    if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");
    applyOfficeTheme();
    try { docId = (!MOCK && Office.context?.document?.url) || (MOCK ? "mock" : "unknown"); } catch { /* ignore */ }

    el.refresh.disabled = false;
    el.analyze.disabled = false;

    const cached = storage.get(RESULT_STORAGE_PREFIX + docId);
    try { storedResult = cached ? JSON.parse(cached) : null; } catch { storedResult = null; }
    renderEmpty("");
    if (storedResult) {
      if (storedResult.textHash) await checkStale(); // shows the score only if the text still matches
      else render(storedResult);                    // result from before hashing existed
    }
    await checkKey();
    if (!MOCK) {
      try {
        Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, scheduleStaleCheck);
      } catch { /* event not available; falls back to checking on pane open */ }
      window.addEventListener("focus", scheduleStaleCheck);
    }
    if (MOCK && params.get("run") === "1") run();
  }

  if (MOCK) boot(); else Office.onReady(() => boot());

  // ---------- mock data for previewing outside Word (?mock=1&run=1) ----------
  const MOCK_TEXT = Array(60).fill("The quick brown fox jumps over the lazy dog while the committee deliberates.").join(" ");
  async function mockAnalyze() {
    await new Promise((r) => setTimeout(r, 600));
    const ai = Number(params.get("ai") ?? 0.15);
    const assisted = Number(params.get("assisted") ?? 0);
    const human = 1 - ai - assisted;
    const short = ai + assisted >= 0.5 ? "AI" : ai + assisted >= 0.2 ? "Mixed" : "Human";
    return {
      version: "4.0",
      model: "pangram-4",
      headline: short === "AI" ? "AI Detected" : short === "Mixed" ? "AI Assisted" : "Human Written",
      prediction: short === "Human"
        ? "We believe that this text is mostly human-written."
        : "We believe that this text is a mix of AI and human-written content.",
      prediction_short: short,
      fraction_ai: ai, fraction_ai_assisted: assisted, fraction_human: human,
      num_ai_segments: Math.round(ai * 10), num_ai_assisted_segments: Math.round(assisted * 10),
      num_human_segments: Math.round(human * 10),
      dashboard_link: "https://www.pangram.com/",
    };
  }
})();
