// Starcall's small server, a Cloudflare Worker.
//
//   GET  /                 health: which features are set up
//   GET  /quotes?symbols=  live stock and option quotes from Tradier (the token stays here, never in the browser)
//   POST /metrics          anonymous, opt-in timings for the product's success measure
//   GET  /metrics/summary  median, quartiles and counts of those timings (public, read-only)
//
// It only READS market data. It never exposes or forwards any Tradier account or trading endpoint.
// Metrics store no IP address, user agent, id or cookie: just the day, the event and the minutes.

const STOCK = /^[A-Z][A-Z.\-]{0,9}$/;
const OCC = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
const MAX_SYMBOLS = 50;
const QUOTE_CACHE_SECONDS = 15;
const POSTS_PER_MINUTE = 30;
const EVENTS = ["lessons_done", "first_trade"];
const DEFAULT_ORIGINS = "https://kaixunwork.github.io,http://localhost:3000,http://localhost:4000";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }
    if (origin && !cors) return json({ error: "Origin not allowed" }, 403);
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/" && request.method === "GET") {
        return json({ ok: true, tradier: !!env.TRADIER_TOKEN, metrics: !!env.DB }, 200, cors);
      }
      if (url.pathname === "/quotes" && request.method === "GET") return await quotes(url, env, ctx, cors);
      if (url.pathname === "/metrics" && request.method === "POST") return await addMetric(request, env, cors);
      if (url.pathname === "/metrics/summary" && request.method === "GET") return await summary(url, env, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: "Server error" }, 500, cors);
    }
  },
};

// ---- CORS ----

function corsHeaders(origin, env) {
  if (!origin) return {}; // same-origin or a non-browser client: no CORS headers needed
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) },
  });
}

// ---- Quotes ----

// Yahoo writes class shares as BRK-B, Tradier as BRK/B
const toTradier = (s) => (OCC.test(s) ? s : s.replace("-", "/"));
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

export function parseSymbols(raw) {
  if (!raw) return { error: "Add ?symbols=AAPL,MSFT" };
  const symbols = [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!symbols.length) return { error: "Add ?symbols=AAPL,MSFT" };
  if (symbols.length > MAX_SYMBOLS) return { error: `At most ${MAX_SYMBOLS} symbols per request` };
  const bad = symbols.filter((s) => !(OCC.test(s) || STOCK.test(s)));
  if (bad.length) return { error: `Not a valid stock or option symbol: ${bad.slice(0, 5).join(", ")}` };
  return { symbols };
}

async function quotes(url, env, ctx, cors) {
  if (!env.TRADIER_TOKEN) return json({ error: "Live quotes aren't set up (no TRADIER_TOKEN)" }, 503, cors);
  const parsed = parseSymbols(url.searchParams.get("symbols"));
  if (parsed.error) return json({ error: parsed.error }, 400, cors);
  const symbols = parsed.symbols.slice().sort();

  // Short cache per symbol set, to protect Tradier's per-minute limit when many pages refresh at once
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://quotes.cache/${encodeURIComponent(symbols.join(","))}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return withHeaders(hit, cors);
  }

  const base = (env.TRADIER_BASE || "https://sandbox.tradier.com/v1").replace(/\/$/, "");
  const back = new Map(symbols.map((s) => [toTradier(s), s])); // Tradier symbol -> what the client sent
  const res = await fetch(`${base}/markets/quotes?symbols=${encodeURIComponent([...back.keys()].join(","))}&greeks=false`, {
    headers: { Authorization: `Bearer ${env.TRADIER_TOKEN}`, Accept: "application/json" },
  });
  const text = await res.text();
  if (text.includes("Quota Violation")) return json({ error: "Too many requests to the quote source. Try again in a minute." }, 429, cors);
  if (res.status === 401) return json({ error: "The quote source refused the server's token" }, 502, cors);
  if (!res.ok) return json({ error: `Quote source error ${res.status}` }, 502, cors);

  let data;
  try { data = JSON.parse(text); } catch { return json({ error: "Quote source sent something unexpected" }, 502, cors); }
  const out = {};
  for (const q of list(data?.quotes?.quote)) {
    const sym = back.get(q.symbol) ?? q.symbol;
    if (!symbols.includes(sym)) continue;
    out[sym] = {
      last: num(q.last), bid: num(q.bid), ask: num(q.ask), change: num(q.change), changePct: num(q.change_percentage),
      volume: num(q.volume),
      ...(q.type === "option" ? { openInterest: num(q.open_interest) } : {}),
      time: q.trade_date ? new Date(q.trade_date).toISOString() : null,
    };
  }
  const body = { asOf: new Date().toISOString(), delayed: !base.startsWith("https://api.tradier.com"), quotes: out };
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${QUOTE_CACHE_SECONDS}` },
  });
  if (cache) {
    const put = cache.put(cacheKey, response.clone());
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  return withHeaders(response, cors);
}

function withHeaders(response, extra) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(extra || {})) r.headers.set(k, v);
  return r;
}

// ---- Metrics ----

// At most POSTS_PER_MINUTE posts per IP per minute. The count lives in this worker's memory only:
// the IP is never written to the database.
const hits = new Map();
export function overLimit(ip, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  const key = `${ip}|${minute}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(`|${minute}`)) hits.delete(k);
  return n > POSTS_PER_MINUTE;
}

export function validMetric(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const allowed = ["event", "minutes", "lessonsDone", "site", "v"];
  if (Object.keys(body).some((k) => !allowed.includes(k))) return null;
  const { event, minutes, lessonsDone, site, v } = body;
  if (v !== 1) return null;
  if (!EVENTS.includes(event)) return null;
  if (typeof minutes !== "number" || !isFinite(minutes) || minutes < 0 || minutes > 10000) return null;
  if (!Number.isInteger(lessonsDone) || lessonsDone < 0 || lessonsDone > 7) return null;
  if (site !== "live" && site !== "dev") return null;
  return { event, minutes: Math.round(minutes * 10) / 10, lessonsDone, site };
}

async function addMetric(request, env, cors) {
  if (!env.DB) return json({ error: "Metrics aren't set up (no DB)" }, 503, cors);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (overLimit(ip)) return json({ error: "Too many requests" }, 429, cors);
  const text = await request.text();
  if (text.length > 1024) return json({ error: "Too large" }, 400, cors);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "Not JSON" }, 400, cors); }
  const m = validMetric(body);
  if (!m) return json({ error: "Invalid metric" }, 400, cors);
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare("INSERT INTO events (day, event, minutes, lessons, site) VALUES (?, ?, ?, ?, ?)")
    .bind(day, m.event, m.minutes, m.lessonsDone, m.site).run();
  return json({ ok: true }, 201, cors);
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 10) / 10;
}

async function summary(url, env, cors) {
  if (!env.DB) return json({ error: "Metrics aren't set up (no DB)" }, 503, cors);
  const site = url.searchParams.get("site") === "dev" ? "dev" : "live";
  const { results = [] } = await env.DB.prepare("SELECT event, minutes, day FROM events WHERE site = ? ORDER BY minutes").bind(site).all();
  const out = { site, since: results.length ? results.map((r) => r.day).sort()[0] : null };
  for (const event of EVENTS) {
    const xs = results.filter((r) => r.event === event).map((r) => r.minutes).sort((a, b) => a - b);
    out[event] = { count: xs.length, median: quantile(xs, 0.5), p25: quantile(xs, 0.25), p75: quantile(xs, 0.75) };
  }
  return json(out, 200, cors);
}
