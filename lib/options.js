// Options maths and the suggestion rules taught in the lessons (lib/lessons.js, lesson 6).
// Shared by the daily data job (scripts/fetch-data.js), which picks the suggestions,
// and the browser, which values paper trades. Pure functions only: no network, no storage.

export const RATE = 0.04; // risk-free interest rate used in the pricing model (roughly US T-bills)
const YEAR_MS = 365 * 86400e3;
const CLOSE_MS = 20.5 * 3600e3; // Yahoo dates an expiry at 00:00 UTC; contracts stop at the 4pm New York close

// The rule numbers here match lesson 6. Change both together.
export const RULES = {
  direction: { n: 1, name: "Analysts lean your way", short: "Analysts" },
  time: { n: 2, name: "Give it 30–75 days", short: "30–75 days" },
  delta: { n: 3, name: "Pick a strike with delta 0.55–0.70", short: "Delta 0.55–0.70" },
  liquid: { n: 4, name: "Only contracts that actually trade", short: "Trades" },
  breakeven: { n: 5, name: "Breakeven inside the analyst target", short: "Breakeven" },
  volatility: { n: 6, name: "Don't overpay for volatility", short: "Volatility" },
};

export const LIMITS = {
  minDays: 30, maxDays: 75,
  minUpside: 10,        // % to the analyst mean target, for a call
  minDownside: 5,       // % below price to the target, for a put (or a sell-side consensus)
  minAnalysts: 5,
  deltaLow: 0.55, deltaHigh: 0.70, deltaIdeal: 0.62,
  minVolume: 100,       // contracts traded in the last session
  maxQuoteAgeDays: 4,   // last trade must be this recent (covers a weekend)
  maxIvToHv: 1.5,       // implied volatility at most 1.5x the stock's own 6-month volatility
};

// ---- Black-Scholes (European, no dividends): good enough to learn with ----

function normCdf(x) {
  // Abramowitz–Stegun 7.1.26, accurate to about 1e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

function d1d2(S, K, T, vol, r) {
  const d1 = (Math.log(S / K) + (r + (vol * vol) / 2) * T) / (vol * Math.sqrt(T));
  return [d1, d1 - vol * Math.sqrt(T)];
}

export function bsPrice(side, S, K, T, vol, r = RATE) {
  if (T <= 0 || vol <= 0) return intrinsic(side, S, K);
  const [d1, d2] = d1d2(S, K, T, vol, r);
  return side === "call"
    ? S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
    : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

// Calls: 0 to 1. Puts: -1 to 0. We show puts' delta as a positive number in the app.
export function bsDelta(side, S, K, T, vol, r = RATE) {
  if (T <= 0 || vol <= 0) return side === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const [d1] = d1d2(S, K, T, vol, r);
  return side === "call" ? normCdf(d1) : normCdf(d1) - 1;
}

export const intrinsic = (side, S, K) => Math.max(0, side === "call" ? S - K : K - S);

// The volatility that makes the model price equal the market price (bisection). null if none fits.
export function impliedVol(side, price, S, K, T, r = RATE) {
  if (!(price > 0) || T <= 0) return null;
  if (price <= intrinsic(side, S, K * Math.exp(-r * T)) + 1e-6) return null; // no time value: can't solve
  let lo = 0.01, hi = 5;
  if (bsPrice(side, S, K, T, hi, r) < price) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bsPrice(side, S, K, T, mid, r) > price) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Annualised volatility of daily closes [{date, close}] (the stock's "own" volatility)
export function histVol(history) {
  const closes = (history || []).map((p) => p.close).filter((c) => c > 0);
  if (closes.length < 40) return null;
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 252);
}

export const yearsTo = (expiryIso, now = Date.now()) => (Date.parse(expiryIso) + CLOSE_MS - now) / YEAR_MS;
export const daysTo = (expiryIso, now = Date.now()) => Math.ceil((Date.parse(expiryIso) + CLOSE_MS - now) / 86400e3);

// ---- The rules ----

// Rule 1: which way the analysts lean. Returns "call", "put" or null, with the reason.
export function analystDirection(analysts, price) {
  if (!analysts || !(price > 0)) return { side: null, why: "No analyst data" };
  const { consensus, count, targetMean } = analysts;
  if (!(count >= LIMITS.minAnalysts)) return { side: null, why: `Fewer than ${LIMITS.minAnalysts} analysts cover it` };
  const move = targetMean > 0 ? (targetMean / price - 1) * 100 : null;
  if (move == null) return { side: null, why: "No price target" };
  const bullish = consensus === "buy" || consensus === "strong_buy";
  if (bullish && move >= LIMITS.minUpside) return { side: "call", move };
  if (!bullish && consensus && move <= -LIMITS.minDownside) return { side: "put", move };
  return { side: null, why: `Rating and target don't agree strongly enough (target ${move >= 0 ? "+" : ""}${move.toFixed(0)}%)` };
}

// Upgrades minus downgrades in the last 90 days
function ratingMomentum(actions, now) {
  const since = new Date(now - 90 * 86400e3).toISOString().slice(0, 10);
  const recent = (actions || []).filter((a) => a.date >= since);
  return {
    up: recent.filter((a) => a.action === "Upgrade").length,
    down: recent.filter((a) => a.action === "Downgrade").length,
  };
}

// Turns one stock file (public/data/s/X.json) and one options chain into a suggestion,
// or { skip: reason } when the rules say no.
// chain: { expiry: "YYYY-MM-DD", source: "Tradier" | "Yahoo", calls: [contract], puts: [contract] }
// contract: { contract, strike, last, bid, ask, volume, openInterest, lastTrade (ISO), iv?, delta? }
export function suggest(stock, chain, now = Date.now()) {
  const S = stock.quote?.price;
  const dir = analystDirection(stock.analysts, S);
  if (!dir.side) return { skip: `Rule 1: ${dir.why}` };
  if (!chain) return { skip: "No options 30–75 days out, or the options data didn't load" };

  const days = daysTo(chain.expiry, now);
  if (days < LIMITS.minDays || days > LIMITS.maxDays) return { skip: `Rule 2: no expiry ${LIMITS.minDays}–${LIMITS.maxDays} days out` };
  const T = yearsTo(chain.expiry, now);

  const candidates = [];
  for (const c of chain[dir.side === "call" ? "calls" : "puts"]) {
    const premium = c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : c.last;
    const ageDays = c.lastTrade ? (now - Date.parse(c.lastTrade)) / 86400e3 : Infinity;
    if (!(premium > 0) || ageDays > LIMITS.maxQuoteAgeDays) continue; // stale or never traded
    // Use the source's own volatility and delta when it has them (Tradier live), otherwise work them out
    const given = c.iv > 0 && typeof c.delta === "number";
    const iv = given ? c.iv : impliedVol(dir.side, premium, S, c.strike, T);
    if (!iv) continue;
    const delta = Math.abs(given ? c.delta : bsDelta(dir.side, S, c.strike, T, iv));
    candidates.push({ ...c, premium, iv, delta, greeksFrom: given ? "source" : "model" });
  }
  if (!candidates.length) return { skip: "No contract with a recent price" };

  // Rule 3 picks the strike: delta closest to the ideal, then rule 4 needs it to actually trade
  candidates.sort((a, b) => Math.abs(a.delta - LIMITS.deltaIdeal) - Math.abs(b.delta - LIMITS.deltaIdeal));
  const inBand = candidates.filter((c) => c.delta >= LIMITS.deltaLow && c.delta <= LIMITS.deltaHigh);
  if (!inBand.length) return { skip: "Rule 3: no strike with delta 0.55–0.70" };
  const pick = inBand.find((c) => c.volume >= LIMITS.minVolume);
  if (!pick) return { skip: `Rule 4: no strike in the delta range traded ${LIMITS.minVolume}+ contracts` };

  const side = dir.side;
  const breakeven = side === "call" ? pick.strike + pick.premium : pick.strike - pick.premium;
  const breakevenMove = (breakeven / S - 1) * 100;
  const hv = histVol(stock.history);
  const target = stock.analysts.targetMean;
  const moveToTarget = dir.move;
  const momentum = ratingMomentum(stock.analysts.actions, now);
  const spreadPct = pick.bid > 0 && pick.ask > 0 ? ((pick.ask - pick.bid) / ((pick.ask + pick.bid) / 2)) * 100 : null;

  const fmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const checks = [
    { rule: "direction", pass: true, detail: `${label(stock.analysts.consensus)} from ${stock.analysts.count} analysts; mean target ${fmt(moveToTarget)} from today` },
    { rule: "time", pass: true, detail: `Expires ${chain.expiry}, ${days} days away` },
    { rule: "delta", pass: true, detail: `Delta ${pick.delta.toFixed(2)}: moves about ${Math.round(pick.delta * 100)}¢ for each $1 the stock moves` },
    { rule: "liquid", pass: true, detail: `${pick.volume.toLocaleString("en-US")} contracts traded last session${pick.openInterest ? `, ${pick.openInterest.toLocaleString("en-US")} open` : ""}${spreadPct != null ? `, bid–ask gap ${spreadPct.toFixed(1)}%` : ""}` },
    {
      rule: "breakeven",
      pass: side === "call" ? breakeven <= target : breakeven >= target,
      detail: `Breakeven ${breakeven.toFixed(2)} (${fmt(breakevenMove)}) vs target ${target.toFixed(2)} (${fmt(moveToTarget)})`,
    },
    {
      rule: "volatility",
      pass: hv != null && pick.iv <= hv * LIMITS.maxIvToHv,
      detail: hv == null
        ? "Not enough price history to compare"
        : `Implied volatility ${(pick.iv * 100).toFixed(0)}% vs the stock's own ${(hv * 100).toFixed(0)}% (limit ${(hv * LIMITS.maxIvToHv * 100).toFixed(0)}%)`,
    },
  ];

  return {
    symbol: stock.symbol,
    name: stock.quote.name,
    currency: stock.quote.currency,
    price: S,
    side,
    contract: pick.contract,
    strike: pick.strike,
    expiry: chain.expiry,
    days,
    premium: round(pick.premium, 2),
    priceSource: pick.bid > 0 && pick.ask > 0 ? "mid" : "last",
    dataSource: chain.source || "Yahoo",
    greeksFrom: pick.greeksFrom,
    bid: pick.bid || null,
    ask: pick.ask || null,
    lastTrade: pick.lastTrade,
    volume: pick.volume,
    openInterest: pick.openInterest || null,
    iv: round(pick.iv, 4),
    hv: hv == null ? null : round(hv, 4),
    delta: round(pick.delta, 3),
    breakeven: round(breakeven, 2),
    breakevenMove: round(breakevenMove, 2),
    analysts: {
      consensus: stock.analysts.consensus,
      count: stock.analysts.count,
      targetMean: target,
      targetLow: stock.analysts.targetLow ?? null,
      targetHigh: stock.analysts.targetHigh ?? null,
      moveToTarget: round(moveToTarget, 2),
      upgrades: momentum.up,
      downgrades: momentum.down,
      recent: (stock.analysts.actions || []).slice(0, 3),
    },
    checks,
    confidence: confidence({ side, checks, analysts: stock.analysts, moveToTarget, breakevenMove, momentum }),
  };
}

// Every suggestion gets a confidence level, with the reasons behind it.
// One point each for: breakeven inside target, fair volatility, wide analyst coverage,
// room to spare (target at least twice as far as breakeven), and ratings moving your way.
export function confidence({ side, checks, analysts, moveToTarget, breakevenMove, momentum }) {
  const reasons = [];
  const add = (ok, yes, no) => reasons.push({ ok, text: ok ? yes : no });
  const passed = (r) => checks.find((c) => c.rule === r)?.pass;
  add(passed("breakeven"), "Breakeven is inside the analyst target", "Breakeven is beyond the analyst target: the stock must beat the analysts");
  add(passed("volatility"), "Option isn't priced for unusual swings", "Option looks expensive for this stock (high implied volatility)");
  add(analysts.count >= 15, `Wide coverage (${analysts.count} analysts)`, `Thin coverage (${analysts.count} analysts)`);
  const room = Math.abs(moveToTarget) >= 2 * Math.abs(breakevenMove);
  add(room, "Target is at least twice as far as breakeven", "Little room between breakeven and target");
  const yourWay = side === "call" ? momentum.up > momentum.down : momentum.down > momentum.up;
  add(yourWay, `Recent rating changes lean your way (${momentum.up} up, ${momentum.down} down)`, `Recent rating changes don't lean your way (${momentum.up} up, ${momentum.down} down)`);
  const score = reasons.filter((r) => r.ok).length;
  // A suggestion that fails a pricing rule (5 or 6) is never more than medium
  const pricingOk = passed("breakeven") && passed("volatility");
  const level = score >= 4 && pricingOk ? "high" : score >= 2 ? "medium" : "low";
  return { level, score, of: reasons.length, reasons };
}

export const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

function label(consensus) {
  return { strong_buy: "Strong buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell" }[consensus] || "No rating";
}

function round(v, d) {
  return typeof v === "number" && isFinite(v) ? +v.toFixed(d) : null;
}

// ---- Paper trades: what a contract is worth now, and at expiry ----

// Estimated value per share today: the pricing model with the volatility seen when you bought
export function estimateValue(trade, stockPrice, now = Date.now()) {
  if (!(stockPrice > 0)) return null;
  const T = yearsTo(trade.expiry, now);
  return T <= 0 ? intrinsic(trade.side, stockPrice, trade.strike) : bsPrice(trade.side, stockPrice, trade.strike, T, trade.iv);
}
