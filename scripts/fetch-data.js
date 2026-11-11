// Collects data for every US, Singapore and Hong Kong stock and saves JSON files the website reads.
//
// Two modes:
//   MODE=full    (daily, ~45 min)  everything for every stock: price, 6-month chart, key numbers,
//                                  analyst consensus + price targets, financial statements, news.
//                                  The largest stocks also get extra news outlets, analyst write-ups
//                                  and (US) firm-by-firm rating changes. The largest US stocks also
//                                  get an options chain, checked against the lesson rules for ideas.
//   MODE=prices  (every ~15 min during market hours, ~1 min)  refreshes price, daily change and
//                                  market-value numbers in the files a full run already wrote.
//
// Output:
//   public/data/index.json       every stock (compact rows, used for search and the market lists)
//   public/data/s/<SYMBOL>.json  one file per stock, read by the stock page
//   public/data/options.json     option ideas that pass the lesson rules (full runs only)
//
// Run locally with:  npm run fetch-data              (full)
//                    MODE=prices npm run fetch-data  (prices only)
// Quick test run:    LIMIT=100 npm run fetch-data

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { listMarket, fetchSpark } from "../lib/universe.js";
import { fetchNews, fetchAnalystNews } from "../lib/sources.js";
import { getAnalystsAndStats, getOptionChain, getStatements } from "../lib/yahoo.js";
import { CONFIDENCE_LABEL, LIMITS, suggest } from "../lib/options.js";
import * as tradier from "../lib/tradier.js";

// Options can come from environment variables (GitHub job) or flags (easier on Windows):
//   --prices  same as MODE=prices        --quick  same as LIMIT=100 (100 stocks per market)
const args = process.argv.slice(2);
const MODE = args.includes("--prices") ? "prices" : process.env.MODE || "full";
const env = (k, d) => (process.env[k] ? Number(process.env[k]) : d);
const LIMIT = args.includes("--quick") ? 100 : env("LIMIT", Infinity); // per market, for test runs
const TOP = { US: env("TOP_US", 500), HK: env("TOP_HK", 100), SG: env("TOP_SG", 40) }; // extra-news tier
const TOP_OPTIONS = env("TOP_OPTIONS", 150); // largest US stocks checked for option ideas
const CONCURRENCY = env("CONCURRENCY", 6);
const MIN_TOTAL = LIMIT === Infinity ? 5000 : 1; // below this, assume we're being blocked

const OUT = new URL("../public/data/", import.meta.url);
const fileFor = (symbol) => new URL(`s/${symbol}.json`, OUT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const started = Date.now();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;

// Run fn over items with at most `n` running at once.
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }));
}

// A part that fails is saved as null (the page then says "not available") instead of stopping everything.
let failures = 0;
async function part(label, symbol, fn) {
  try {
    return await fn();
  } catch (e) {
    failures++;
    if (failures <= 200) console.warn(`  ! ${symbol} ${label}: ${e.message}`);
    return null;
  }
}

function progress(label, done, total, every = 100) {
  if (done % every === 0 || done === total) console.log(`  ${label} ${done}/${total} (${elapsed()})`);
}

// ---- 1. List every stock (both modes) ----
console.log(`Mode: ${MODE}. Listing stocks…`);
const stocks = [];
for (const market of ["US", "HK", "SG"]) {
  const list = await listMarket(market);
  console.log(`  ${market}: ${list.length} stocks`);
  stocks.push(...list.slice(0, LIMIT));
}
if (stocks.length < MIN_TOTAL) {
  console.error(`Only ${stocks.length} stocks listed. The source may be blocking us; not publishing.`);
  process.exit(1);
}

const updatedAt = new Date().toISOString();

// Exchange rates to USD, so market values in HK$ and S$ can be compared and sorted with US$
// Previous run's index (if any): fallback FX rates, and rows to carry over in prices mode
let prevIndex = null;
try { prevIndex = JSON.parse(await readFile(new URL("index.json", OUT), "utf8")); } catch {}
const fx = await getFx([...new Set(stocks.map((s) => s.currency).filter(Boolean))], prevIndex?.fx);
console.log(`  FX to USD: ${JSON.stringify(fx)}`);


// ---------------------------------------------------------------------------------------------

async function fullRun() {
  // ---- 2. Charts, 20 stocks per request ----
  console.log(`Fetching 6-month charts… (${elapsed()})`);
  const history = {};
  const batches = [];
  for (let i = 0; i < stocks.length; i += 20) batches.push(stocks.slice(i, i + 20).map((s) => s.symbol));
  let done = 0;
  await pool(batches, 3, async (batch) => {
    const h = await part("charts", batch[0] + "…", () => fetchSpark(batch));
    if (h) Object.assign(history, h);
    progress("chart batches", ++done, batches.length, 100);
    await sleep(200);
  });

  // ---- 3. Detail for every stock ----
  const top = new Set();
  for (const m of ["US", "HK", "SG"]) {
    stocks.filter((s) => s.market === m).slice(0, TOP[m]).forEach((s) => top.add(s.symbol));
  }
  console.log(`Fetching detail for ${stocks.length} stocks… (${elapsed()})`);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(new URL("s/", OUT), { recursive: true });

  const rows = [];
  const forOptions = new Set(stocks.filter((s) => s.market === "US").slice(0, TOP_OPTIONS).map((s) => s.symbol));
  const optionFiles = [];
  done = 0;
  await pool(stocks, CONCURRENCY, async (s) => {
    const isTop = top.has(s.symbol);
    const [news, analystNews, fundamentals, statements] = await Promise.all([
      part("news", s.symbol, () => fetchNews(s.symbol, s.market, s.name, isTop)),
      isTop ? part("analyst news", s.symbol, () => fetchAnalystNews(s.symbol, s.market, s.name)) : null,
      part("analysts/stats", s.symbol, () => getAnalystsAndStats(s.symbol)),
      part("statements", s.symbol, () => getStatements(s.symbol)),
    ]);
    const file = {
      symbol: s.symbol,
      market: s.market,
      updatedAt,
      detailUpdatedAt: updatedAt,
      top: isTop,
      // "full" = the main company data (analysts, key numbers, profile) came through
      full: fundamentals != null,
      quote: quoteOf(s),
      history: history[s.symbol] || [],
      // Full stats where we have them, otherwise the basic set from the screener
      stats: fundamentals?.stats ? { ...s.stats, ...dropNulls(fundamentals.stats) } : s.stats,
      profile: fundamentals?.profile ?? null,
      analysts: fundamentals?.analysts ?? lightAnalysts(s),
      news: news?.items ?? null,
      analystNews: analystNews?.items ?? null,
      statements,
    };
    await writeFile(fileFor(s.symbol), JSON.stringify(file));
    rows.push(indexRow(s, file));
    if (forOptions.has(s.symbol) && file.full) optionFiles.push(file);
    progress("stocks", ++done, stocks.length, 250);
    await sleep(100);
  });

  await writeIndex(rows);
  const noDetail = rows.filter((r) => !r[COLUMNS.indexOf("full")]).length;
  console.log(`Done in ${elapsed()}: ${rows.length} stocks, ${rows.length - noDetail} with detail, ${failures} failed parts.`);

  // If detail failed for most stocks, the sources are probably blocking us.
  if (noDetail > rows.length / 2) {
    console.error("Detail failed for over half the stocks. Not publishing this data.");
    process.exit(1);
  }

  await optionIdeas(optionFiles);
}

// ---- 4. Option ideas: the lesson rules applied to the largest US stocks ----
// Failing here never stops the run: the options page just says ideas aren't available.
async function optionIdeas(files) {
  const useTradier = tradier.hasTradier();
  console.log(`Checking options for ${files.length} US stocks with ${useTradier ? "Tradier (Yahoo as backup)" : "Yahoo (no TRADIER_TOKEN set)"}… (${elapsed()})`);
  const suggestions = [];
  const skipped = [];
  const sources = { Tradier: 0, Yahoo: 0 };
  let tradierFails = 0;
  let done = 0;
  await pool(files, 4, async (file) => {
    // Tradier first. If it errors or has no chain for this stock, use Yahoo instead.
    let chain = null;
    if (useTradier && tradierFails < 10) {
      try {
        chain = await tradier.getOptionChain(file.symbol, LIMITS, file.quote.price);
      } catch (e) {
        // A bad token fails every stock: after 10 errors, stop asking Tradier and use Yahoo for the rest
        if (++tradierFails <= 3 || tradierFails === 10) console.warn(`  ! ${file.symbol} Tradier: ${e.message}${tradierFails === 10 ? " (using Yahoo for the rest)" : ""}`);
      }
    }
    chain ??= await part("options", file.symbol, () => getOptionChain(file.symbol, LIMITS));
    if (chain) sources[chain.source]++;
    const result = suggest(file, chain);
    if (result.skip) skipped.push({ symbol: file.symbol, name: file.quote.name, reason: result.skip });
    else suggestions.push(result);
    progress("option chains", ++done, files.length, 50);
    await sleep(150);
  });
  const order = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => order[a.confidence.level] - order[b.confidence.level] || b.confidence.score - a.confidence.score ||
    Math.abs(b.analysts.moveToTarget) - Math.abs(a.analysts.moveToTarget));
  skipped.sort((a, b) => a.symbol.localeCompare(b.symbol));
  await writeFile(new URL("options.json", OUT), JSON.stringify({ updatedAt, scanned: files.length, sources, limits: LIMITS, suggestions, skipped }));
  const counts = Object.keys(order).map((l) => `${suggestions.filter((x) => x.confidence.level === l).length} ${CONFIDENCE_LABEL[l].toLowerCase()}`);
  console.log(`Option ideas: ${suggestions.length} (${counts.join(", ")}), ${skipped.length} skipped. Chains: ${sources.Tradier} Tradier, ${sources.Yahoo} Yahoo. (${elapsed()})`);
}

async function pricesOnly() {
  if (!existsSync(new URL("index.json", OUT))) {
    console.error("No data from a full run to update. Run with MODE=full first.");
    process.exit(1);
  }
  console.log(`Updating prices… (${elapsed()})`);
  const rows = [];
  await pool(stocks, 16, async (s) => {
    let file;
    try {
      file = JSON.parse(await readFile(fileFor(s.symbol), "utf8"));
    } catch {
      // Newly listed since the last full run: basic data until the next full run
      file = {
        symbol: s.symbol, market: s.market, full: false, top: false, history: [], stats: s.stats, profile: null,
        analysts: lightAnalysts(s), news: null, analystNews: null, statements: null, detailUpdatedAt: null,
      };
    }
    file.updatedAt = updatedAt;
    file.quote = quoteOf(s);
    // Refresh the market-driven numbers; keep company figures from the full run
    // (P/E and dividend yield stay from the full run: the screener's versions are defined differently)
    file.stats = { ...file.stats, ...pick(s.stats, ["marketCap", "fiftyTwoWeekLow", "fiftyTwoWeekHigh", "volume"]) };
    // Keep today's point on the chart in step with the live price
    const day = s.asOf?.slice(0, 10);
    if (day && s.price != null && file.history.length) {
      const last = file.history.at(-1);
      if (last.date === day) last.close = s.price;
      else if (last.date < day) file.history.push({ date: day, close: s.price });
    }
    await writeFile(fileFor(s.symbol), JSON.stringify(file));
    rows.push(indexRow(s, file));
  });
  // The screener pages through a live-sorted list, so a few stocks can be skipped mid-session.
  // Keep their last known row rather than letting them vanish from search and the calls page.
  let carried = 0;
  if (prevIndex?.columns?.join() === COLUMNS.join()) {
    const seen = new Set(rows.map((r) => r[0]));
    const changeCol = COLUMNS.indexOf("changePct");
    for (const r of prevIndex.rows) {
      if (seen.has(r[0])) continue;
      const row = [...r];
      row[changeCol] = null; // yesterday's move isn't today's: keep it out of movers and breadth
      rows.push(row);
      carried++;
    }
  }
  await writeIndex(rows);
  console.log(`Done in ${elapsed()}: prices updated for ${rows.length - carried} stocks (${carried} carried over unchanged).`);
}

// ---------------------------------------------------------------------------------------------

function quoteOf(s) {
  return {
    name: s.name, price: s.price, change: s.change, changePct: s.changePct,
    currency: s.currency, exchange: s.exchange, asOf: s.asOf,
  };
}

function lightAnalysts(s) {
  return s.consensus ? { consensus: s.consensus, count: null, actions: [], trend: null } : null;
}

// One compact row per stock for the search/screener page. Keep COLUMNS and the array in the same order.
const COLUMNS = [
  "symbol", "name", "market", "currency", "price", "changePct", "marketCap", "marketCapUsd", "consensus",
  "full", "sector", "industry", "pe", "divYield", "volume", "high52", "low52", "targetMean",
];

function indexRow(s, file) {
  const st = file.stats || {};
  const rate = fx[s.currency];
  return [
    s.symbol, s.name, s.market, s.currency, s.price, round(s.changePct, 2),
    st.marketCap ?? null, st.marketCap != null && rate ? Math.round(st.marketCap * rate) : null,
    file.analysts?.consensus ?? null, file.full ? 1 : 0,
    file.profile?.sector ?? null, file.profile?.industry ?? null,
    round(st.trailingPE, 2), round(st.dividendYield, 4), st.volume ?? null,
    st.fiftyTwoWeekHigh ?? null, st.fiftyTwoWeekLow ?? null, round(file.analysts?.targetMean, 2),
  ];
}

async function writeIndex(rows) {
  rows.sort((a, b) => (b[7] ?? 0) - (a[7] ?? 0)); // largest (in USD) first
  await writeFile(new URL("index.json", OUT), JSON.stringify({ updatedAt, fx, columns: COLUMNS, rows }));
}

async function getFx(currencies, previous = {}) {
  const rates = { USD: 1 };
  const pairs = currencies.filter((c) => c !== "USD").map((c) => `${c}USD=X`);
  if (!pairs.length) return rates;
  const res = await part("fx", pairs.join(","), () => fetchSpark(pairs));
  for (const c of currencies) {
    const last = res?.[`${c}USD=X`]?.at(-1)?.close;
    if (last) rates[c] = last;
    else if (previous?.[c]) rates[c] = previous[c]; // keep yesterday's rate rather than none
  }
  const missing = ["HKD", "SGD"].filter((c) => currencies.includes(c) && !rates[c]);
  if (missing.length) {
    console.error(`No exchange rate for ${missing.join(", ")}. Not publishing, to avoid mis-sorted market values.`);
    process.exit(1);
  }
  return rates;
}

function dropNulls(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
}
function pick(o, keys) {
  return dropNulls(Object.fromEntries(keys.map((k) => [k, o[k]])));
}
function round(v, d) {
  return typeof v === "number" ? +v.toFixed(d) : null;
}

// ---- Run (at the end, so everything above is defined) ----
if (MODE === "prices") {
  await pricesOnly();
} else {
  await fullRun();
}
