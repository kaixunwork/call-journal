// Builds the single-page Starcall Options artifact from the project's real data.
//   node build.mjs /home/user/call-journal  -> starcall-options.html (next to this script)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));
const { LESSONS } = await import(join(root, "lib/lessons.js"));
const { RULES } = await import(join(root, "lib/options.js"));
const full = JSON.parse(readFileSync(join(root, "public/demo/backtest.json"), "utf8"));
const b = full.backtest;

const trade = (e) => e && ({
  symbol: e.symbol, side: e.side, strike: e.strike, expiry: e.expiry, premium: e.premium, breakeven: e.breakeven,
  loggedOn: e.loggedOn, predict: e.predict, outcome: e.outcome, value: e.value, returnPct: e.returnPct,
  stockAtExpiry: e.stockAtExpiry, path: e.path.map((p) => ({ date: p.date, close: +p.close.toFixed(2) })),
});
const ex = b.examples.win;
const events = full.events.slice().reverse().filter((e) => ["replaced", "refuted", "reinforced"].includes(e.type));

const DATA = {
  rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, { n: v.n, name: v.name }])),
  lessons: LESSONS,
  backtest: {
    universe: b.universe, from: b.from, to: b.to, totals: b.totals, monthly: b.monthly,
    modelled: b.modelled, biases: b.biases,
    timeline: b.timeline.filter((t) => t.yHitRate != null && t.yCalls >= 10).map((t) => ({ d: t.date, h: t.active, r: +t.yHitRate.toFixed(3), n: t.yCalls })),
    examples: { win: { ...ex, chartBefore: ex.chartBefore.map((p) => ({ date: p.date, close: +p.close.toFixed(2) })), path: undefined } },
  },
  tradeable: [trade(b.examples.win), trade(b.examples.bust), trade(b.examples.afterSwitch)].filter(Boolean),
  switches: events.filter((e) => e.type === "replaced").map((e) => ({ date: e.date, hyp: e.hyp })),
  events: events.map((e) => ({ date: e.date, type: e.type, text: e.text })),
  calls: b.calls.filter((c) => c.outcome === "Y" || c.outcome === "N").slice(0, 300)
    .map((c) => ({ date: c.date, symbol: c.symbol, side: c.side, strike: c.strike, expiry: c.expiry, premium: c.premium, predict: c.predict,
      confidence: c.confidence, outcome: c.outcome, returnPct: c.returnPct, stockAtExpiry: c.stockAtExpiry, hyp: c.hyp })),
};
const json = JSON.stringify(DATA).replace(/</g, "\\u003c");
const html = readFileSync(join(here, "template.html"), "utf8").replace("/*DATA*/null", json);
writeFileSync(join(here, "starcall-options.html"), html);
console.log(`starcall-options.html: ${(html.length / 1024).toFixed(0)} KB, ${DATA.calls.length} calls, ${DATA.tradeable.length} tradeable examples, ${DATA.lessons.length} lessons`);
