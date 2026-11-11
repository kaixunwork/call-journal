// Options chains from Tradier (https://docs.tradier.com), the main source for option ideas.
// Unlike Yahoo after the close, Tradier keeps each contract's closing bid, ask and open interest,
// and its live (production) API adds implied volatility and delta from ORATS.
//
// Needs a token in TRADIER_TOKEN (a GitHub secret). Use a SANDBOX token: the app only reads market data,
// and a live token gives full access to a brokerage account. Sandbox data is 15 minutes delayed and has
// no Greeks, which is fine for a daily run after the close; lib/options.js works out volatility and delta itself.
// TRADIER_ENV=live switches to the live API (only with a live token).
//
// Without a token, or when Tradier has nothing for a stock, the data job falls back to Yahoo.

const TOKEN = process.env.TRADIER_TOKEN || "";
const BASE = process.env.TRADIER_ENV === "live" ? "https://api.tradier.com/v1" : "https://sandbox.tradier.com/v1";
const PER_MINUTE = process.env.TRADIER_ENV === "live" ? 110 : 55; // limits are 120 (live) and 60 (sandbox)

export const hasTradier = () => !!TOKEN;

// One request at a time, spaced to stay under the per-minute limit
let nextSlot = 0;
async function slot() {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(nextSlot, Date.now()) + 60000 / PER_MINUTE;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function get(path, params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await slot();
    const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    // Over the limit, Tradier answers 400 "Quota Violation: Expires <epoch ms>" rather than 429
    if (text.includes("Quota Violation")) {
      const until = Number(text.match(/Expires\s+(\d+)/)?.[1]) || Date.now() + 60000;
      nextSlot = Math.max(nextSlot, until + 500);
      continue;
    }
    if (res.status === 401) throw new Error("Tradier refused the token (401). Is it a sandbox token with TRADIER_ENV unset?");
    if (!res.ok) throw new Error(`Tradier ${path} ${res.status}`);
    return JSON.parse(text);
  }
  throw new Error("Tradier kept saying the rate limit was exceeded");
}

// Tradier returns a lone item as an object instead of a one-item list
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Yahoo writes class shares as BRK-B, Tradier as BRK/B
const tradierSymbol = (symbol) => symbol.replace("-", "/");

const iso = (d) => d.toISOString().slice(0, 10);

// Standard monthly expiries (third Friday) between minDays and maxDays out: every optionable large
// stock has them, so we can usually skip a request for the list of expiries.
function monthlyGuesses(minDays, maxDays, now = Date.now()) {
  const out = [];
  const d = new Date(now);
  for (let m = 0; m < 4; m++) {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
    const third = new Date(first);
    third.setUTCDate(1 + ((5 - first.getUTCDay() + 7) % 7) + 14);
    const days = (third.getTime() - now) / 86400e3;
    if (days >= minDays && days <= maxDays) out.push(iso(third));
  }
  return out;
}

async function listedExpiry(symbol, minDays, maxDays, now = Date.now()) {
  const json = await get("/markets/options/expirations", { symbol });
  return list(json.expirations?.date).find((date) => {
    const days = (Date.parse(date) - now) / 86400e3;
    return days >= minDays && days <= maxDays;
  }) || null;
}

async function chainFor(symbol, expiration) {
  const json = await get("/markets/options/chains", { symbol, expiration, greeks: "true" });
  return list(json.options?.option);
}

// Same shape as getOptionChain in lib/yahoo.js, plus iv/delta when Tradier provides Greeks.
// Returns null when Tradier has no chain 30–75 days out.
export async function getOptionChain(ticker, { minDays = 30, maxDays = 75 } = {}, price = null) {
  const symbol = tradierSymbol(ticker);
  let expiry = monthlyGuesses(minDays, maxDays)[0];
  // An invalid date gives an empty answer, not an error (e.g. an expiry moved for a holiday)
  let options = expiry ? await chainFor(symbol, expiry) : [];
  if (!options.length) {
    expiry = await listedExpiry(symbol, minDays, maxDays);
    options = expiry ? await chainFor(symbol, expiry) : [];
  }
  if (!options.length) return null;
  return { expiry, source: "Tradier", ...parseChain(options, price) };
}

// Exported for testing with a sample response
export function parseChain(options, price = null) {
  // Standard 100-share contracts on the usual root only (not ones adjusted after a split or merger),
  // with strikes within 25% of the price
  const keep = (o) => (o.contract_size ?? 100) === 100 && o.expiration_type !== "adjusted" &&
    (!price || Math.abs(o.strike / price - 1) <= 0.25);
  const slim = (o) => {
    const iv = o.greeks?.mid_iv || o.greeks?.smv_vol || null;
    return {
      contract: o.symbol,
      strike: o.strike,
      last: o.last ?? o.close ?? null,
      bid: o.bid ?? 0,
      ask: o.ask ?? 0,
      volume: o.volume ?? 0,
      openInterest: o.open_interest ?? 0,
      lastTrade: o.trade_date ? new Date(o.trade_date).toISOString() : null,
      iv: iv > 0 ? iv : null,
      delta: typeof o.greeks?.delta === "number" ? o.greeks.delta : null,
    };
  };
  const all = options.filter(keep).sort((a, b) => a.strike - b.strike);
  return {
    calls: all.filter((o) => o.option_type === "call").map(slim),
    puts: all.filter((o) => o.option_type === "put").map(slim),
  };
}
