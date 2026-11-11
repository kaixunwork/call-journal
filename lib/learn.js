// The bot's self-learning loop. Pure functions over a "ledger"; scripts/fetch-data.js loads it,
// runs one step a day after the full data run, and saves it to the bot-ledger branch, so every
// prediction and every change of mind is in git history and can't be quietly rewritten.
//
//   1. Hypotheses: each is one set of rule settings (DEFAULT_PARAMS in lib/options.js). One is "active"
//      (its ideas are shown to you); the others are "challengers", tracked silently on the same stocks.
//   2. Predict: every idea a hypothesis produces is logged with its prediction, BEFORE the result is known:
//      Y = expected to end in profit (positive expected value), N = expected to lose.
//   3. Score: at expiry the option's value comes from the stock's closing price that day.
//      Outcome Y if it's worth more than the premium paid, N if not. The prediction was right or wrong.
//   4. Learn: a hypothesis is judged on its Y calls (when it says "profit", is it right?), over its
//      latest WINDOW settled Y calls, once it has at least MIN_EVIDENCE of them.
//        - right at least half the time: kept and marked "reinforced"
//        - right less than half the time: "refuted". The best challenger that holds up replaces it.
//          With no proven challenger it stays on, marked refuted, and its own poor record pulls its
//          expected values (and so its predictions) down.
//        - a challenger right less than 40% of the time is retired.
//      Jev (lib/jev.js), when its key is set, predicts the same ideas independently; whichever of Jev and the
//      bot's expected value has been right more often decides the prediction and confidence you see.
//      New challengers are made by changing one setting of the best hypothesis at a time, so the bot
//      keeps testing new ideas. No randomness: the same results always lead to the same decisions.

import { DEFAULT_PARAMS, intrinsic, suggest } from "./options.js";

export const WINDOW = 60;
export const MIN_EVIDENCE = 20;
export const KEEP_AT = 0.5;
export const RETIRE_BELOW = 0.4;
export const CHALLENGERS = 5;

// The settings a challenger may change, and the values each can take
const STEPS = {
  minUpside: [5, 10, 15, 20, 30],
  delta: [[0.40, 0.55], [0.55, 0.70], [0.70, 0.85]],
  maxIvToHv: [1.2, 1.5, 2.0],
  needBreakeven: [false, true],
  needVolatility: [false, true],
  needMomentum: [false, true],
  avoidEarnings: [false, true],
};

const key = (p) => JSON.stringify([p.minUpside, p.deltaLow, p.deltaHigh, p.maxIvToHv, p.needBreakeven, p.needVolatility, p.needMomentum, !!p.avoidEarnings]);

export function emptyLedger(today) {
  const ledger = { version: 1, nextId: 1, hypotheses: [], entries: [], events: [] };
  addHypothesis(ledger, { ...DEFAULT_PARAMS }, today, "active", null, "The rules taught in lesson 6");
  return ledger;
}

function addHypothesis(ledger, params, today, status, parent, why) {
  const h = { id: `H${ledger.nextId++}`, params, status, createdOn: today, parent, verdict: "testing" };
  ledger.hypotheses.push(h);
  ledger.events.push({ date: today, type: "created", hyp: h.id, text: `${h.id} created${parent ? ` from ${parent}` : ""}: ${why}` });
  return h;
}

// Plain-English statement of a hypothesis
export function describe(p) {
  const parts = [
    `analysts rate it Buy with a target ${p.minUpside}%+ above the price (or Hold or worse with a target 5%+ below, for a put)`,
    `strike with delta ${p.deltaLow.toFixed(2)}–${p.deltaHigh.toFixed(2)}`,
    `30–75 days to expiry, actively traded`,
  ];
  if (p.needBreakeven) parts.push("breakeven inside the analyst target");
  if (p.needVolatility) parts.push(`implied volatility at most ${p.maxIvToHv}× the stock's own`);
  if (p.needMomentum) parts.push("recent rating changes leaning the same way");
  if (p.avoidEarnings) parts.push("no earnings report before expiry");
  return `Buying the option when ${parts.join("; ")} makes money more often than not.`;
}

// What changed from one hypothesis's settings to another's
export function diff(from, to) {
  const out = [];
  if (from.minUpside !== to.minUpside) out.push(`target upside ${from.minUpside}% → ${to.minUpside}%`);
  if (from.deltaLow !== to.deltaLow) out.push(`delta ${from.deltaLow}–${from.deltaHigh} → ${to.deltaLow}–${to.deltaHigh}`);
  if (from.maxIvToHv !== to.maxIvToHv) out.push(`volatility limit ${from.maxIvToHv}× → ${to.maxIvToHv}×`);
  for (const [k, name] of [["needBreakeven", "breakeven rule required"], ["needVolatility", "volatility rule required"], ["needMomentum", "rating momentum required"], ["avoidEarnings", "no earnings before expiry required"]]) {
    if (!!from[k] !== !!to[k]) out.push(`${name}: ${from[k] ? "yes" : "no"} → ${to[k] ? "yes" : "no"}`);
  }
  return out.join(", ");
}

// Every one-setting change of p, in a fixed order
function neighbours(p) {
  const out = [];
  const bump = (arr, i, f) => { for (const j of [i + 1, i - 1]) if (arr[j] !== undefined) out.push(f(arr[j])); };
  bump(STEPS.minUpside, STEPS.minUpside.indexOf(p.minUpside), (v) => ({ ...p, minUpside: v }));
  bump(STEPS.delta, STEPS.delta.findIndex(([lo]) => lo === p.deltaLow), ([lo, hi]) => ({ ...p, deltaLow: lo, deltaHigh: hi }));
  for (const k of ["needBreakeven", "needVolatility", "needMomentum"]) out.push({ ...p, [k]: !p[k] });
  bump(STEPS.maxIvToHv, STEPS.maxIvToHv.indexOf(p.maxIvToHv), (v) => ({ ...p, maxIvToHv: v }));
  out.push({ ...p, avoidEarnings: !p.avoidEarnings });
  return out;
}

// ---- Track record ----

export function stats(ledger, hypId) {
  const mine = ledger.entries.filter((e) => e.hyp === hypId && (e.outcome === "Y" || e.outcome === "N"));
  const all = mine.slice(-WINDOW);
  const yCalls = mine.filter((e) => e.predict === "Y").slice(-WINDOW);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    // every settled idea: feeds expected value
    settled: all.length,
    winRate: all.length ? all.filter((e) => e.outcome === "Y").length / all.length : null,
    avgReturn: avg(all.map((e) => e.returnPct)),
    // its "profit" calls: what it's judged on
    yCalls: yCalls.length,
    yRight: yCalls.filter((e) => e.outcome === "Y").length,
    yHitRate: yCalls.length ? yCalls.filter((e) => e.outcome === "Y").length / yCalls.length : null,
    // how often any prediction (Y or N) matched the result
    accuracy: all.length ? all.filter((e) => e.predict === e.outcome).length / all.length : null,
    open: ledger.entries.filter((e) => e.hyp === hypId && !e.outcome).length,
  };
}

// ---- 3. Score ----
// histories: { [symbol]: [{date, close}] } from today's full run; closedThrough: today's date (final closes)
export function settle(ledger, histories, closedThrough) {
  let n = 0;
  for (const e of ledger.entries) {
    if (e.outcome || e.expiry > closedThrough) continue;
    const point = histories[e.symbol]?.find((p) => p.date >= e.expiry && p.date <= closedThrough);
    if (!point) {
      // Delisted or missing: don't count it either way
      if ((Date.parse(closedThrough) - Date.parse(e.expiry)) / 86400e3 > 10) { e.outcome = "void"; e.settledOn = closedThrough; }
      continue;
    }
    const value = intrinsic(e.side, point.close, e.strike);
    e.stockAtExpiry = point.close;
    e.value = +value.toFixed(4);
    e.returnPct = +((value - e.premium) / e.premium).toFixed(4);
    e.outcome = value > e.premium ? "Y" : "N";
    e.right = e.outcome === e.predict;
    if (e.jev) e.jev.right = e.jev.predict === e.outcome;
    e.settledOn = closedThrough;
    n++;
  }
  return n;
}

// ---- 4. Learn ----
export function evolve(ledger, today) {
  const live = () => ledger.hypotheses.filter((h) => h.status !== "retired");
  const judged = (h) => { const s = stats(ledger, h.id); return { h, s, ready: s.yCalls >= MIN_EVIDENCE }; };
  const log = (type, hyp, text) => ledger.events.push({ date: today, type, hyp, text });
  const pct = (x) => `${Math.round(x * 100)}%`;
  const rec = (s) => `${s.yRight} of ${s.yCalls} profit calls right (${pct(s.yHitRate)})`;

  // Challengers that keep failing are retired
  for (const { h, s, ready } of live().filter((h) => h.status === "challenger").map(judged)) {
    if (ready && s.yHitRate < RETIRE_BELOW) {
      h.status = "retired"; h.retiredOn = today;
      log("retired", h.id, `${h.id} retired: ${rec(s)}`);
    }
  }

  // The active hypothesis: kept while it works, replaced when it doesn't
  const active = live().find((h) => h.status === "active");
  const a = judged(active);
  if (a.ready && a.s.yHitRate >= KEEP_AT) {
    if (active.verdict !== "reinforced") log("reinforced", active.id, `${active.id} reinforced: ${rec(a.s)}. Kept as the active hypothesis.`);
    active.verdict = "reinforced";
  } else if (a.ready) {
    const best = live().filter((h) => h.status === "challenger").map(judged)
      .filter((c) => c.ready && c.s.yHitRate >= KEEP_AT)
      .sort((x, y) => y.s.yHitRate - x.s.yHitRate || y.s.avgReturn - x.s.avgReturn)[0];
    if (best) {
      active.status = "retired"; active.verdict = "refuted"; active.retiredOn = today;
      best.h.status = "active"; best.h.verdict = "reinforced"; best.h.promotedOn = today;
      log("replaced", best.h.id,
        `${active.id} refuted (${rec(a.s)}). Replaced by ${best.h.id} (${rec(best.s)}), which changes: ${diff(active.params, best.h.params)}.`);
    } else if (active.verdict !== "refuted") {
      active.verdict = "refuted";
      log("refuted", active.id, `${active.id} refuted (${rec(a.s)}), but no challenger has proven better yet. It stays on with lower expected values until one does.`);
    }
  }

  chooseDecider(ledger, today);

  // Keep the pool full: new challengers are one-setting changes of the best hypothesis so far
  const seen = new Set(ledger.hypotheses.map((h) => key(h.params)));
  const ranked = live().map(judged).sort((x, y) => (y.ready - x.ready) || ((y.s.yHitRate ?? 0) - (x.s.yHitRate ?? 0)));
  const parent = ranked.find((r) => r.ready)?.h || live().find((h) => h.status === "active");
  for (const p of neighbours(parent.params)) {
    if (live().filter((h) => h.status === "challenger").length >= CHALLENGERS) break;
    if (seen.has(key(p))) continue;
    seen.add(key(p));
    addHypothesis(ledger, p, today, "challenger", parent.id, diff(parent.params, p));
  }
}

// ---- Jev vs the bot's own expected value ----
// Both predict the same ideas (the active hypothesis's, from the day each first appears). Whichever has been
// right more often over the latest WINDOW settled ideas decides what the app shows; Jev starts in charge.
export function jevStats(ledger) {
  const both = ledger.entries.filter((e) => e.jev && (e.outcome === "Y" || e.outcome === "N")).slice(-WINDOW);
  const buckets = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([lo, hi]) => {
    const inB = both.filter((e) => e.jev.confidence >= lo && e.jev.confidence < hi);
    return { from: lo, to: Math.min(hi, 1), n: inB.length, right: inB.filter((e) => e.jev.right).length };
  });
  return {
    settled: both.length,
    jevRight: both.filter((e) => e.jev.right).length,
    evRight: both.filter((e) => e.predict === e.outcome).length,
    avgConfidence: both.length ? both.reduce((a, e) => a + e.jev.confidence, 0) / both.length : null,
    buckets, // is Jev's confidence honest? within each band, how often it was right
    open: ledger.entries.filter((e) => e.jev && !e.outcome).length,
  };
}

function chooseDecider(ledger, today) {
  const j = jevStats(ledger);
  ledger.decider ??= "jev";
  if (j.settled < MIN_EVIDENCE) return;
  const want = j.jevRight >= j.evRight ? "jev" : "ev";
  if (want === ledger.decider) return;
  ledger.decider = want;
  ledger.events.push({ date: today, type: want === "jev" ? "reinforced" : "refuted", hyp: "Jev",
    text: want === "ev"
      ? `Jev was right on ${j.jevRight} of ${j.settled} settled ideas, the bot's own expected value on ${j.evRight}. The bot's expected value decides from now on.`
      : `Jev is right again more often (${j.jevRight} of ${j.settled}, vs ${j.evRight} for expected value). Jev decides from now on.` });
}

// ---- 2. Predict ----
// Runs every live hypothesis over today's stocks and chains. Logs each new idea (one per hypothesis,
// stock and expiry, the first day it appears). Returns the active hypothesis's ideas for the app.
// items: [{ file, chain }]
export function predict(ledger, items, today, now = Date.now()) {
  const shown = [];
  const skipped = [];
  for (const h of ledger.hypotheses.filter((x) => x.status !== "retired")) {
    const record = stats(ledger, h.id);
    const logged = new Set(ledger.entries.filter((e) => e.hyp === h.id).map((e) => `${e.symbol}|${e.expiry}`));
    for (const { file, chain } of items) {
      const r = suggest(file, chain, now, h.params, record);
      if (h.status === "active") {
        if (r.skip) skipped.push({ symbol: file.symbol, name: file.quote.name, reason: r.skip });
        else shown.push({ ...r, hyp: h.id });
      }
      if (r.skip || logged.has(`${r.symbol}|${r.expiry}`)) continue;
      ledger.entries.push({
        hyp: h.id, date: today, symbol: r.symbol, side: r.side, contract: r.contract, strike: r.strike,
        expiry: r.expiry, premium: r.premium, stockAtEntry: r.price, predict: r.predict,
        ev: r.ev.value, winChance: r.ev.winChance, confidence: r.confidence.level, outcome: null,
      });
    }
  }
  return { shown, skipped };
}

// The part of the ledger the app shows: hypotheses with their records, the change log, recent entries
export function publicLedger(ledger, updatedAt) {
  return {
    updatedAt,
    rules: { WINDOW, MIN_EVIDENCE, KEEP_AT, RETIRE_BELOW, CHALLENGERS },
    decider: ledger.decider ?? "jev",
    jev: jevStats(ledger),
    hypotheses: ledger.hypotheses.map((h) => ({ ...h, statement: describe(h.params), stats: stats(ledger, h.id) })),
    events: ledger.events.slice(-200).reverse(),
    entries: ledger.entries.slice(-600).reverse(),
  };
}
