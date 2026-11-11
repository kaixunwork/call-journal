// Tests the worker's fetch handler with a fake Tradier and a fake D1 database:  node worker/test.mjs
import assert from "node:assert/strict";

// A minimal Cache API stand-in
const store = new Map();
globalThis.caches = { default: { match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => { store.set(r.url, res); } } };

// Fake Tradier
let tradierCalls = 0;
let tradierMode = "ok";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(url);
  assert.ok(u.pathname.endsWith("/markets/quotes"), "only the quotes endpoint is ever called");
  assert.equal(opts.headers.Authorization, "Bearer secret-token");
  tradierCalls++;
  if (tradierMode === "quota") return new Response("Quota Violation: Expires 1799200800000", { status: 400 });
  const syms = u.searchParams.get("symbols").split(",");
  const q = syms.map((s) => ({ symbol: s, type: s.length > 10 ? "option" : "stock", last: 10, bid: 9.9, ask: 10.1, change: 0.5, change_percentage: 5, volume: 100, open_interest: 42, trade_date: 1794337276000 }));
  return new Response(JSON.stringify({ quotes: { quote: q.length === 1 ? q[0] : q } }), { status: 200 });
};

// Fake D1
const rows = [];
const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          run: async () => { assert.match(sql, /^INSERT INTO events/); const [day, event, minutes, lessons, site] = args; rows.push({ day, event, minutes, lessons, site }); return { success: true }; },
          all: async () => ({ results: rows.filter((r) => r.site === args[0]).map(({ event, minutes, day }) => ({ event, minutes, day })) }),
        };
      },
    };
  },
};

const { default: worker, overLimit } = await import("./index.js");
const env = { TRADIER_TOKEN: "secret-token", DB };
const O = "https://kaixunwork.github.io";
const call = (path, { method = "GET", origin = O, body, ip = "1.1.1.1", e = env } = {}) =>
  worker.fetch(new Request(`https://api.example${path}`, { method, body, headers: { ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip, ...(body ? { "Content-Type": "application/json" } : {}) } }), e, { waitUntil() {} });
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };

await t("health", async () => {
  const r = await call("/"); assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, tradier: true, metrics: true });
  assert.deepEqual(await (await call("/", { e: {} })).json(), { ok: true, tradier: false, metrics: false });
});
await t("CORS preflight allowed / refused", async () => {
  const r = await call("/quotes", { method: "OPTIONS" });
  assert.equal(r.status, 204); assert.equal(r.headers.get("Access-Control-Allow-Origin"), O);
  assert.equal((await call("/quotes", { method: "OPTIONS", origin: "https://evil.example" })).status, 403);
  assert.equal((await call("/?x", { origin: "https://evil.example" })).status, 403);
  assert.equal((await call("/", { origin: "http://localhost:3000" })).headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
});
await t("only GET/POST", async () => { assert.equal((await call("/", { method: "DELETE" })).status, 405); });
await t("quotes: validation", async () => {
  assert.equal((await call("/quotes")).status, 400);
  assert.equal((await call("/quotes?symbols=AAPL,%3Cscript%3E")).status, 400);
  assert.equal((await call(`/quotes?symbols=${Array.from({ length: 51 }, (_, i) => "A" + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26))).join(",")}`)).status, 400);
  assert.equal((await call("/quotes?symbols=AAPL", { e: { DB } })).status, 503);
});
await t("quotes: single-object quirk, class shares, option open interest, no token leak", async () => {
  const r = await call("/quotes?symbols=brk-b"); assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.quotes["BRK-B"], "keyed by what the client sent"); assert.equal(d.quotes["BRK-B"].last, 10); assert.equal(d.delayed, true);
  assert.ok(!JSON.stringify(d).includes("secret"));
  const r2 = await (await call("/quotes?symbols=AAPL,AAPL261218C00250000")).json();
  assert.equal(r2.quotes.AAPL261218C00250000.openInterest, 42); assert.equal(r2.quotes.AAPL.openInterest, undefined);
});
await t("quotes: cached for repeat requests", async () => {
  const before = tradierCalls; await call("/quotes?symbols=AAPL,AAPL261218C00250000"); assert.equal(tradierCalls, before);
});
await t("quotes: Quota Violation becomes 429", async () => {
  tradierMode = "quota"; const r = await call("/quotes?symbols=MSFT"); assert.equal(r.status, 429); tradierMode = "ok";
});
await t("metrics: strict validation", async () => {
  const bad = [
    {}, { event: "x", minutes: 1, lessonsDone: 1, site: "live", v: 1 }, { event: "first_trade", minutes: -1, lessonsDone: 1, site: "live", v: 1 },
    { event: "first_trade", minutes: 1, lessonsDone: 8, site: "live", v: 1 }, { event: "first_trade", minutes: 1, lessonsDone: 1, site: "prod", v: 1 },
    { event: "first_trade", minutes: 1, lessonsDone: 1, site: "live", v: 2 }, { event: "first_trade", minutes: 1, lessonsDone: 1, site: "live", v: 1, email: "a@b" },
  ];
  for (const b of bad) assert.equal((await call("/metrics", { method: "POST", body: JSON.stringify(b), ip: "9.9.9.9" })).status, 400, JSON.stringify(b));
  assert.equal((await call("/metrics", { method: "POST", body: "x".repeat(2000), ip: "9.9.9.8" })).status, 400);
  assert.equal(rows.length, 0);
});
await t("metrics: insert and summary (live by default, dev separate)", async () => {
  for (const m of [10, 20, 30, 40, 50]) assert.equal((await call("/metrics", { method: "POST", body: JSON.stringify({ event: "first_trade", minutes: m, lessonsDone: 7, site: "live", v: 1 }), ip: "2.2.2." + m })).status, 201);
  await call("/metrics", { method: "POST", body: JSON.stringify({ event: "lessons_done", minutes: 35, lessonsDone: 7, site: "dev", v: 1 }) });
  assert.ok(rows.every((r) => Object.keys(r).join() === "day,event,minutes,lessons,site"), "no ip or id stored");
  const s = await (await call("/metrics/summary")).json();
  assert.deepEqual(s.first_trade, { count: 5, median: 30, p25: 20, p75: 40 }); assert.equal(s.lessons_done.count, 0);
  const d = await (await call("/metrics/summary?site=dev")).json(); assert.equal(d.lessons_done.median, 35);
});
await t("metrics: 30 posts a minute per IP", async () => {
  const now = Date.now(); let blocked = 0;
  for (let i = 0; i < 31; i++) if (overLimit("7.7.7.7", now)) blocked++;
  assert.equal(blocked, 1); assert.equal(overLimit("7.7.7.7", now + 61000), false);
});
await t("unknown path", async () => { assert.equal((await call("/accounts/123/orders")).status, 404); });
console.log(`${passed} passed`);
globalThis.fetch = realFetch;
