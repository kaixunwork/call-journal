// A SIMULATION of the bot's learning loop, for testing lib/learn.js and for the demo.
// It runs the real engine (lib/learn.js + lib/options.js) day by day on a made-up market of 40 stocks.
// The market has one hidden pattern: stocks whose analyst ratings are being upgraded tend to rise,
// the rest tend to drift down. The lesson 6 rules (H1) don't look at upgrades, so they should lose
// money, get refuted, and be replaced by a challenger that requires rating momentum.
//
//   node scripts/simulate-bot.js            -> writes public/demo/ledger.json (+ a summary)
//
// Nothing here is real market data. The demo pages label it "Simulation" everywhere it appears.

import { mkdir, writeFile } from "node:fs/promises";
import { bsPrice } from "../lib/options.js";
import { emptyLedger, evolve, predict, publicLedger, settle, stats } from "../lib/learn.js";

// Repeatable random numbers (same results every run)
let seed = 20261111;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const START = Date.parse("2025-10-06T22:30:00Z");
const DAYS = 330; // calendar days simulated

const stocks = Array.from({ length: 40 }, (_, i) => {
  const upgraded = i % 2 === 0;            // the hidden pattern
  const price = 40 + rand() * 260;
  return {
    symbol: `SIM${String(i + 1).padStart(2, "0")}`,
    upgraded,
    vol: 0.25 + rand() * 0.25,
    drift: upgraded ? 0.6 : -0.45,          // a year
    price,
    target: price * (1.12 + rand() * 0.3),  // analysts are bullish on all of them
    history: [],
  };
});

// 120 days of price history before the start, so volatility can be measured
for (const s of stocks) {
  let p = s.price;
  for (let d = -120; d < 0; d++) {
    p *= Math.exp((s.drift - s.vol ** 2 / 2) / 365 + (s.vol / Math.sqrt(365)) * normal());
    s.history.push({ date: iso(START + d * DAY), close: +p.toFixed(2) });
  }
  s.price = p;
  s.target = p * (1.12 + rand() * 0.3);
}

function chainFor(s, now) {
  // Monthly expiries: the first 3rd-Friday-like date 30–75 days out (here: every 28 days from the start)
  let exp = START + 35 * DAY;
  while ((exp - now) / DAY < 30) exp += 28 * DAY;
  const expiry = iso(exp);
  const T = (exp - now) / (365 * DAY);
  const iv = s.vol * (0.9 + rand() * 0.5);
  const strikes = Array.from({ length: 21 }, (_, k) => Math.round(s.price * (0.8 + k * 0.02)));
  const mk = (side) => strikes.map((k) => {
    const prem = bsPrice(side, s.price, k, T, iv);
    return { contract: `${s.symbol}${expiry.replaceAll("-", "").slice(2)}${side[0].toUpperCase()}${k}`, strike: k,
      bid: +(prem * 0.98).toFixed(2), ask: +(prem * 1.02).toFixed(2), last: +prem.toFixed(2), volume: 300 + Math.round(rand() * 2000),
      openInterest: 1000, lastTrade: new Date(now - 3600e3).toISOString() };
  });
  return { expiry, source: "Simulation", calls: mk("call"), puts: mk("put") };
}

const ledger = emptyLedger(iso(START));
const timeline = [];
for (let d = 0; d < DAYS; d++) {
  const now = START + d * DAY;
  const today = iso(now);
  const weekday = new Date(now).getUTCDay();
  for (const s of stocks) {
    s.price *= Math.exp((s.drift - s.vol ** 2 / 2) / 365 + (s.vol / Math.sqrt(365)) * normal());
    s.history.push({ date: today, close: +s.price.toFixed(2) });
    if (s.history.length > 400) s.history.shift();
  }
  if (weekday === 0 || weekday === 6) continue;

  const histories = Object.fromEntries(stocks.map((s) => [s.symbol, s.history]));
  settle(ledger, histories, today);
  evolve(ledger, today);
  const items = stocks.map((s) => ({
    file: {
      symbol: s.symbol,
      quote: { price: s.price, name: `Simulated stock ${s.symbol.slice(3)}`, currency: "USD" },
      history: s.history.slice(-126),
      analysts: {
        consensus: "buy", count: 18, targetMean: +s.target.toFixed(2),
        actions: s.upgraded
          ? [{ date: iso(now - 12 * DAY), action: "Upgrade", firm: "Sim Securities" }]
          : [{ date: iso(now - 12 * DAY), action: "Downgrade", firm: "Sim Securities" }],
      },
    },
    chain: chainFor(s, now),
  }));
  predict(ledger, items, today, now);
  const active = ledger.hypotheses.find((h) => h.status === "active");
  timeline.push({ date: today, active: active.id, ...stats(ledger, active.id) });
}

const last = timeline.at(-1).date;
const out = publicLedger(ledger, `${last}T22:30:00Z`);
out.simulation = {
  note: "Simulated market, not real data. 40 made-up stocks; stocks being upgraded by analysts tend to rise, the rest tend to fall. The bot is not told this.",
  start: iso(START), end: last, timeline,
};
out.entries = ledger.entries.slice().reverse(); // the demo keeps every entry for its replay
await mkdir(new URL("../public/demo/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/demo/ledger.json", import.meta.url), JSON.stringify(out));

for (const e of ledger.events) console.log(`${e.date}  ${e.text}`);
for (const h of ledger.hypotheses) {
  const s = stats(ledger, h.id);
  console.log(`${h.id} ${h.status.padEnd(10)} ${h.verdict.padEnd(10)} Y-calls ${s.yRight}/${s.yCalls}  avg return ${s.avgReturn == null ? "—" : (s.avgReturn * 100).toFixed(0) + "%"}`);
}
