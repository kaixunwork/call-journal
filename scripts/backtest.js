// A real-world backtest of the bot: the real engine (lib/learn.js + lib/options.js), replayed week by week
// over the last ~2.5 years of REAL market history for the largest US stocks.
//
//   node scripts/backtest.js    -> public/demo/backtest.json (shown at /options/backtest/)
//
// What's real:
//   - every stock's daily closing prices (Yahoo chart, 3 years)
//   - what analysts thought on each date: each firm's latest rating and price target as of that day,
//     rebuilt from Yahoo's dated history of rating changes (so nothing from the future leaks in)
//   - every outcome: each option is scored from the stock's real closing price on its expiry day
// What's modelled (expired options' prices aren't freely available anywhere):
//   - option premiums: Black-Scholes using the stock's own volatility over the previous 20 trading days,
//     plus 15% (options usually trade above recent volatility), with a 3% bid-ask spread
//   - every contract is assumed to trade actively (rule 4), and earnings dates aren't known (rule 7)
// Known bias: the stocks are today's largest, which did well to get there (survivorship bias).

import { mkdir, writeFile } from "node:fs/promises";
import { bsPrice, histVol } from "../lib/options.js";
import { describe, emptyLedger, evolve, predict, publicLedger, settle, stats } from "../lib/learn.js";
import { listMarket } from "../lib/universe.js";
import { yahooJson } from "../lib/yahoo.js";
import { UA } from "../lib/sources.js";

const N = Number(process.env.STOCKS || 40);
const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. Real data ----
console.log(`Listing the ${N} largest US stocks…`);
const universe = (await listMarket("US")).slice(0, N);

async function closes(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1d`, { headers: { "User-Agent": UA } });
  const r = (await res.json()).chart?.result?.[0];
  const c = r?.indicators?.quote?.[0]?.close; // raw (not dividend-adjusted) closes: options settle on these
  return (r?.timestamp || []).map((t, i) => ({ date: iso(t * 1000), close: c?.[i] })).filter((p) => p.close > 0).map((p) => ({ ...p, close: +p.close.toFixed(4) }));
}
async function ratings(symbol) {
  const j = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=upgradeDowngradeHistory`);
  return (j.quoteSummary?.result?.[0]?.upgradeDowngradeHistory?.history || [])
    .map((h) => ({ date: iso(h.epochGradeDate * 1000), firm: h.firm, toGrade: h.toGrade || null, action: h.action, target: h.currentPriceTarget > 0 ? h.currentPriceTarget : null }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const stocks = [];
for (const s of universe) {
  try {
    const [h, r] = await Promise.all([closes(s.symbol), ratings(s.symbol)]);
    if (h.length > 300) stocks.push({ symbol: s.symbol, name: s.name, history: h, ratings: r });
  } catch (e) { console.warn(`  ! ${s.symbol}: ${e.message}`); }
  await sleep(250);
}
console.log(`  ${stocks.length} stocks with 3 years of prices and analyst history`);

// ---- 2. Rebuild what analysts thought on a given day (only what was known by then) ----
const GRADE = [
  [/strong sell/i, 5], [/strong buy|conviction buy|top pick/i, 1],
  [/underperform|underweight|reduce|negative|sell/i, 4],
  [/buy|outperform|overweight|positive|accumulate|\badd\b/i, 2],
  [/hold|neutral|equal|perform|in-line|sector weight|mixed|market weight|fair value/i, 3],
];
const gradeScore = (g) => (g ? GRADE.find(([re]) => re.test(g))?.[1] ?? null : null);
const ACTION = { up: "Upgrade", down: "Downgrade", init: "Initiated", main: "Maintained", reit: "Reiterated" };

function analystsAt(s, day) {
  const from = iso(Date.parse(day) - 365 * DAY);
  const latest = new Map();
  for (const a of s.ratings) {
    if (a.date > day) break;
    if (a.date >= from) latest.set(a.firm, a);
  }
  const firms = [...latest.values()];
  const scores = firms.map((a) => gradeScore(a.toGrade)).filter((x) => x != null);
  const targets = firms.map((a) => a.target).filter((x) => x > 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const consensus = avg == null ? null : avg <= 1.5 ? "strong_buy" : avg <= 2.5 ? "buy" : avg <= 3.5 ? "hold" : avg <= 4.5 ? "underperform" : "sell";
  const since90 = iso(Date.parse(day) - 90 * DAY);
  return {
    consensus, count: firms.length, score: avg == null ? null : +avg.toFixed(2),
    targetMean: targets.length ? +(targets.reduce((a, b) => a + b, 0) / targets.length).toFixed(2) : null,
    targetLow: targets.length ? Math.min(...targets) : null,
    targetHigh: targets.length ? Math.max(...targets) : null,
    actions: s.ratings.filter((a) => a.date >= since90 && a.date <= day).reverse()
      .map((a) => ({ date: a.date, firm: a.firm, action: ACTION[a.action] || a.action, toGrade: a.toGrade, target: a.target })),
  };
}

// ---- 3. Modelled option chain for a real stock on a real day ----
function thirdFriday(y, m) {
  const first = new Date(Date.UTC(y, m, 1));
  return new Date(Date.UTC(y, m, 1 + ((5 - first.getUTCDay() + 7) % 7) + 14));
}
function expiryFor(day) {
  const d = new Date(`${day}T00:00:00Z`);
  for (let k = 0; k < 4; k++) {
    const f = thirdFriday(d.getUTCFullYear(), d.getUTCMonth() + k);
    const days = (f - d) / DAY;
    if (days >= 31 && days <= 75) return iso(f);
  }
  return null;
}
function chainFor(s, hist, day, now) {
  const S = hist.at(-1).close;
  const expiry = expiryFor(day);
  if (!expiry) return null;
  const T = (Date.parse(expiry) + 20.5 * 3600e3 - now) / (365 * DAY);
  const iv = Math.max(0.15, (histVol(hist.slice(-21).concat(hist.slice(-21)).slice(-42)) ?? 0.3) * 1.15);
  const step = S < 50 ? 1 : S < 200 ? 2.5 : S < 500 ? 5 : 10;
  const strikes = [];
  for (let k = Math.ceil((S * 0.75) / step) * step; k <= S * 1.25; k += step) strikes.push(+k.toFixed(2));
  const mk = (side) => strikes.map((k) => {
    const mid = bsPrice(side, S, k, T, iv);
    return { contract: `${s.symbol}${expiry.replaceAll("-", "").slice(2)}${side[0].toUpperCase()}${String(Math.round(k * 1000)).padStart(8, "0")}`,
      strike: k, bid: +(mid * 0.985).toFixed(2), ask: +(mid * 1.015).toFixed(2), last: +mid.toFixed(2),
      volume: 1000, openInterest: 5000, lastTrade: new Date(now - 3600e3).toISOString() };
  }).filter((c) => c.last >= 0.05);
  return { expiry, source: "Modelled", calls: mk("call"), puts: mk("put"), modelIv: +iv.toFixed(4) };
}

// ---- 4. Replay: one step a week, the real engine, real outcomes ----
const days = [...new Set(stocks.flatMap((s) => s.history.map((p) => p.date)))].sort();
const start = days[130]; // ~6 months of history first, for volatility
const weekly = days.filter((d, i) => d >= start && (i === 0 || new Date(`${d}T00:00:00Z`).getUTCDay() < new Date(`${days[i - 1]}T00:00:00Z`).getUTCDay()));
const lastClose = days.at(-1);
const ledger = emptyLedger(weekly[0]);
const snapshots = new Map(); // full idea as the bot saw it, for the worked examples
const timeline = [];
console.log(`Replaying ${weekly.length} weeks, ${weekly[0]} to ${lastClose}…`);

for (const day of weekly) {
  const now = Date.parse(`${day}T21:30:00Z`);
  const histories = Object.fromEntries(stocks.map((s) => [s.symbol, s.history.filter((p) => p.date <= day)]));
  settle(ledger, histories, day);
  evolve(ledger, day);
  const items = [];
  for (const s of stocks) {
    const hist = histories[s.symbol];
    if (hist.length < 60 || hist.at(-1).date !== day) continue;
    const analysts = analystsAt(s, day);
    items.push({
      file: { symbol: s.symbol, quote: { price: hist.at(-1).close, name: s.name, currency: "USD" }, history: hist.slice(-126), analysts, stats: {} },
      chain: chainFor(s, hist, day, now),
    });
  }
  const { shown } = predict(ledger, items, day, now);
  for (const idea of shown) {
    const k = `${idea.hyp}|${idea.symbol}|${idea.expiry}`;
    if (!snapshots.has(k)) snapshots.set(k, { ...idea, loggedOn: day, chartBefore: histories[idea.symbol].slice(-90) });
  }
  const active = ledger.hypotheses.find((h) => h.status === "active");
  const st = stats(ledger, active.id);
  timeline.push({ date: day, active: active.id, yCalls: st.yCalls, yHitRate: st.yHitRate, avgReturn: st.avgReturn, shown: shown.length });
}
// Settle everything that has expired by the last real close
settle(ledger, Object.fromEntries(stocks.map((s) => [s.symbol, s.history])), lastClose);
evolve(ledger, lastClose);

// ---- 5. Worked examples: the bot's very first profit call, its first win and first bust, and the first idea after it changed its mind ----
const firstActive = ledger.hypotheses[0].id;
const settledY = ledger.entries.filter((e) => e.hyp === firstActive && e.predict === "Y" && (e.outcome === "Y" || e.outcome === "N"));
const pick = (e) => {
  if (!e) return null;
  const snap = snapshots.get(`${e.hyp}|${e.symbol}|${e.expiry}`);
  if (!snap) return null;
  const s = stocks.find((x) => x.symbol === e.symbol);
  return {
    ...snap, outcome: e.outcome, value: e.value, returnPct: e.returnPct, stockAtExpiry: e.stockAtExpiry, settledOn: e.settledOn,
    path: s.history.filter((p) => p.date >= snap.loggedOn && p.date <= e.expiry),
  };
};
const replaced = ledger.events.find((e) => e.type === "replaced");
const afterSwitch = replaced && ledger.entries.find((e) => e.hyp === replaced.hyp && e.date >= replaced.date && e.predict === "Y" && (e.outcome === "Y" || e.outcome === "N"));
const examples = {
  win: pick(settledY.find((e) => e.outcome === "Y" && ["NVDA", "AAPL", "MSFT", "AMZN", "META", "GOOGL"].includes(e.symbol)) || settledY.find((e) => e.outcome === "Y")),
  bust: pick(settledY.find((e) => e.outcome === "N" && e.returnPct <= -0.9) || settledY.find((e) => e.outcome === "N")),
  afterSwitch: pick(afterSwitch),
};

// Results by month of expiry, for the active-at-the-time hypothesis's profit calls
const monthly = {};
for (const e of ledger.entries.filter((x) => x.predict === "Y" && (x.outcome === "Y" || x.outcome === "N"))) {
  const activeThen = timeline.filter((t) => t.date <= e.date).at(-1)?.active;
  if (e.hyp !== activeThen) continue;
  const m = (monthly[e.expiry.slice(0, 7)] ??= { month: e.expiry.slice(0, 7), ideas: 0, wins: 0, busts: 0, sumReturn: 0, hyp: e.hyp });
  m.ideas++; if (e.outcome === "Y") m.wins++; else m.busts++; m.sumReturn += e.returnPct;
}

// Biggest wins and busts among the profit calls of whichever hypothesis was active at the time
const activeAt = (d) => timeline.filter((t) => t.date <= d).at(-1)?.active;
const shownSettled = ledger.entries.filter((e) => e.predict === "Y" && (e.outcome === "Y" || e.outcome === "N") && e.hyp === activeAt(e.date));
const brief = (e) => ({ symbol: e.symbol, side: e.side, strike: e.strike, date: e.date, expiry: e.expiry, premium: e.premium, stockAtEntry: e.stockAtEntry, stockAtExpiry: e.stockAtExpiry, returnPct: e.returnPct, hyp: e.hyp });
const byReturn = shownSettled.slice().sort((a, b) => b.returnPct - a.returnPct);
const totals = {
  ideas: shownSettled.length,
  wins: shownSettled.filter((e) => e.outcome === "Y").length,
  wipeouts: shownSettled.filter((e) => e.returnPct <= -0.999).length,
  avgReturn: shownSettled.reduce((a, e) => a + e.returnPct, 0) / (shownSettled.length || 1),
  medianReturn: byReturn[Math.floor(byReturn.length / 2)]?.returnPct ?? null,
};

const out = publicLedger(ledger, `${lastClose}T22:30:00Z`);
delete out.entries; // the page uses the summaries below, not every one of the thousands of logged ideas
out.backtest = {
  universe: stocks.map((s) => s.symbol),
  from: weekly[0], to: lastClose, weeks: weekly.length,
  real: ["Daily closing prices (Yahoo Finance)", "Each firm's rating and price target as of each date, rebuilt from dated rating changes", "Every outcome: the stock's real close on each option's expiry day"],
  modelled: ["Option premiums: Black-Scholes from the stock's previous 20 trading days of volatility, plus 15%, with a 3% bid-ask spread", "Every contract assumed to trade actively (rule 4)", "Earnings dates unknown (rule 7 can't be checked)"],
  biases: ["Today's 40 largest US stocks were chosen, and they did well to get here (survivorship bias)", "Real option prices often differ from the model, especially around earnings"],
  firstHypothesis: firstActive, statement: describe(ledger.hypotheses[0].params),
  timeline, monthly: Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)), examples,
  totals, best: byReturn.slice(0, 5).map(brief), worst: byReturn.slice(-5).reverse().map(brief),
  // Every call of whichever rule set was in charge when it was made (what you would have seen), newest first
  calls: ledger.entries.filter((e) => e.hyp === activeAt(e.date)).reverse().map((e) => ({
    date: e.date, symbol: e.symbol, side: e.side, strike: e.strike, expiry: e.expiry, premium: e.premium, predict: e.predict,
    confidence: e.confidence, ev: e.ev, outcome: e.outcome, returnPct: e.returnPct ?? null, stockAtExpiry: e.stockAtExpiry ?? null, hyp: e.hyp,
  })),
};
await mkdir(new URL("../public/demo/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/demo/backtest.json", import.meta.url), JSON.stringify(out));

for (const e of ledger.events.filter((x) => x.type !== "created")) console.log(`${e.date}  ${e.text}`);
for (const h of ledger.hypotheses) {
  const s = stats(ledger, h.id);
  if (s.yCalls) console.log(`${h.id.padEnd(4)} ${h.status.padEnd(10)} ${h.verdict.padEnd(10)} profit calls right ${s.yRight}/${s.yCalls}  avg return ${s.avgReturn == null ? "—" : (s.avgReturn * 100).toFixed(0) + "%"}  ${h.parent ? "from " + h.parent : ""}`);
}
console.log("examples:", Object.entries(examples).map(([k, v]) => `${k}=${v ? `${v.symbol} ${v.loggedOn} ${v.outcome} ${(v.returnPct * 100).toFixed(0)}%` : "none"}`).join("  "));
