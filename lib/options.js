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

export function normCdf(x) {
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
export function analystDirection(analysts, price, minUpside = LIMITS.minUpside) {
  if (!analysts || !(price > 0)) return { side: null, why: "No analyst data" };
  const { consensus, count, targetMean } = analysts;
  if (!(count >= LIMITS.minAnalysts)) return { side: null, why: `Fewer than ${LIMITS.minAnalysts} analysts cover it` };
  const move = targetMean > 0 ? (targetMean / price - 1) * 100 : null;
  if (move == null) return { side: null, why: "No price target" };
  const bullish = consensus === "buy" || consensus === "strong_buy";
  if (bullish && move >= minUpside) return { side: "call", move };
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

// The tunable part of the rules. Each "hypothesis" the bot tests is one set of these (lib/learn.js).
// DEFAULT_PARAMS are the rules taught in lesson 6; the bot starts with them.
export const DEFAULT_PARAMS = {
  minUpside: 10,        // rule 1: % to the analyst target, for a call
  deltaLow: 0.55,       // rule 3
  deltaHigh: 0.70,
  maxIvToHv: 1.5,       // rule 6 limit
  needBreakeven: false, // true: rule 5 must pass (otherwise it only lowers expected value)
  needVolatility: false,// true: rule 6 must pass
  needMomentum: false,  // true: recent upgrades must outnumber downgrades (downgrades for puts)
};

// Turns one stock file (public/data/s/X.json) and one options chain into a suggestion,
// or { skip: reason } when the rules say no.
// chain: { expiry: "YYYY-MM-DD", source: "Tradier" | "Yahoo", calls: [contract], puts: [contract] }
// contract: { contract, strike, last, bid, ask, volume, openInterest, lastTrade (ISO), iv?, delta? }
// params: one hypothesis's rule settings. record: that hypothesis's track record (learn.js stats), if any.
export function suggest(stock, chain, now = Date.now(), params = DEFAULT_PARAMS, record = null) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const S = stock.quote?.price;
  const dir = analystDirection(stock.analysts, S, p.minUpside);
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

  // Rule 3 picks the strike: delta closest to the middle of the band, then rule 4 needs it to actually trade
  const ideal = (p.deltaLow + p.deltaHigh) / 2;
  candidates.sort((a, b) => Math.abs(a.delta - ideal) - Math.abs(b.delta - ideal));
  const inBand = candidates.filter((c) => c.delta >= p.deltaLow && c.delta <= p.deltaHigh);
  if (!inBand.length) return { skip: `Rule 3: no strike with delta ${p.deltaLow.toFixed(2)}–${p.deltaHigh.toFixed(2)}` };
  const pick = inBand.find((c) => c.volume >= LIMITS.minVolume);
  if (!pick) return { skip: `Rule 4: no strike in the delta range traded ${LIMITS.minVolume}+ contracts` };

  const side = dir.side;
  const breakeven = side === "call" ? pick.strike + pick.premium : pick.strike - pick.premium;
  const breakevenMove = (breakeven / S - 1) * 100;
  const hv = histVol(stock.history);
  const target = stock.analysts.targetMean;
  const moveToTarget = dir.move;
  const momentum = ratingMomentum(stock.analysts.actions, now);
  const momentumOk = side === "call" ? momentum.up > momentum.down : momentum.down > momentum.up;
  const spreadPct = pick.bid > 0 && pick.ask > 0 ? ((pick.ask - pick.bid) / ((pick.ask + pick.bid) / 2)) * 100 : null;

  const fmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const checks = [
    { rule: "direction", pass: true, detail: `${label(stock.analysts.consensus)} from ${stock.analysts.count} analysts; mean target ${fmt(moveToTarget)} from today (needs ${side === "call" ? `+${p.minUpside}%` : `−${LIMITS.minDownside}%`})` },
    { rule: "time", pass: true, detail: `Expires ${chain.expiry}, ${days} days away` },
    { rule: "delta", pass: true, detail: `Delta ${pick.delta.toFixed(2)} (band ${p.deltaLow.toFixed(2)}–${p.deltaHigh.toFixed(2)}): moves about ${Math.round(pick.delta * 100)}¢ for each $1 the stock moves` },
    { rule: "liquid", pass: true, detail: `${pick.volume.toLocaleString("en-US")} contracts traded last session${pick.openInterest ? `, ${pick.openInterest.toLocaleString("en-US")} open` : ""}${spreadPct != null ? `, bid–ask gap ${spreadPct.toFixed(1)}%` : ""}` },
    {
      rule: "breakeven",
      pass: side === "call" ? breakeven <= target : breakeven >= target,
      detail: `Breakeven ${breakeven.toFixed(2)} (${fmt(breakevenMove)}) vs target ${target.toFixed(2)} (${fmt(moveToTarget)})`,
    },
    {
      rule: "volatility",
      pass: hv != null && pick.iv <= hv * p.maxIvToHv,
      detail: hv == null
        ? "Not enough price history to compare"
        : `Implied volatility ${(pick.iv * 100).toFixed(0)}% vs the stock's own ${(hv * 100).toFixed(0)}% (limit ${(hv * p.maxIvToHv * 100).toFixed(0)}%)`,
    },
  ];
  const passed = (r) => checks.find((c) => c.rule === r).pass;
  if (p.needBreakeven && !passed("breakeven")) return { skip: "Rule 5 (required by this hypothesis): breakeven beyond the target" };
  if (p.needVolatility && !passed("volatility")) return { skip: "Rule 6 (required by this hypothesis): volatility too high" };
  if (p.needMomentum && !momentumOk) return { skip: "Recent rating changes don't lean this way (required by this hypothesis)" };

  const ev = expectedValue({ side, S, strike: pick.strike, premium: pick.premium, T, hv: hv ?? pick.iv, target, record });

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
    ev,
    predict: ev.value > 0 ? "Y" : "N", // the bot's hypothesis for this idea: Y = ends in profit, N = ends in a loss
    confidence: confidence(ev),
  };
}

// ---- Expected value (EV): the bot's own estimate of how an idea pays off on average ----
//
// Model EV: assume the stock drifts toward the analysts' 12-month target at the pace they imply
// (capped at ±50% a year: targets run optimistic) and swings as much as it has over the last 6 months.
// Then average the option's value at expiry over all those outcomes and compare it with the premium.
//
// Track-record EV: the average return of every settled idea from the same hypothesis.
// The two are blended by how much evidence there is: weight on the track record = n / (n + 20).
// So with no history the model decides; after 20 settled ideas it's half and half; after 60, mostly results.
export const EV_PRIOR = 20;

export function expectedValue({ side, S, strike, premium, T, hv, target, record }) {
  const drift = Math.max(-0.5, Math.min(0.5, Math.log(target / S))); // per year
  const m = S * Math.exp(drift * T);          // expected stock price at expiry
  const sd = hv * Math.sqrt(T);
  const d1 = (Math.log(m / strike) + (sd * sd) / 2) / sd;
  const d2 = d1 - sd;
  const payoff = side === "call" ? m * normCdf(d1) - strike * normCdf(d2) : strike * normCdf(-d2) - m * normCdf(-d1);
  const be = side === "call" ? strike + premium : strike - premium;
  const dBe = (Math.log(m / be) - (sd * sd) / 2) / sd;
  const modelReturn = payoff / premium - 1;
  const modelWin = side === "call" ? normCdf(dBe) : normCdf(-dBe);

  const n = record?.settled ?? 0;
  const w = n / (n + EV_PRIOR);
  const value = (1 - w) * modelReturn + w * (record?.avgReturn ?? 0);
  const winChance = (1 - w) * modelWin + w * (record?.winRate ?? 0);
  return {
    value: round(value, 4),           // expected return per $1 of premium (0.25 = +25%)
    winChance: round(winChance, 4),   // chance it ends in profit
    model: { value: round(modelReturn, 4), winChance: round(modelWin, 4) },
    record: n ? { settled: n, avgReturn: round(record.avgReturn, 4), winRate: round(record.winRate, 4) } : null,
    weight: round(w, 3),
  };
}

// Confidence comes from expected value: high = EV +20% or more with a better-than-even chance of profit;
// medium = positive EV; low = zero or negative EV (the bot predicts a loss).
export function confidence(ev) {
  const level = ev.value >= 0.2 && ev.winChance >= 0.5 ? "high" : ev.value > 0 ? "medium" : "low";
  const pc = (x) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  const reasons = [
    { ok: ev.value > 0, text: `Expected value ${pc(ev.value)} per $1 of premium` },
    { ok: ev.winChance >= 0.5, text: `${Math.round(ev.winChance * 100)}% estimated chance of ending in profit` },
    { ok: ev.model.value > 0, text: `Model alone: ${pc(ev.model.value)}, ${Math.round(ev.model.winChance * 100)}% chance` },
    ev.record
      ? { ok: ev.record.avgReturn > 0, text: `This hypothesis so far: ${ev.record.settled} settled, ${Math.round(ev.record.winRate * 100)}% profitable, average ${pc(ev.record.avgReturn)} (counts ${Math.round(ev.weight * 100)}%)` }
      : { ok: false, text: "No settled results for this hypothesis yet: the estimate is the model's alone" },
  ];
  return { level, reasons };
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
