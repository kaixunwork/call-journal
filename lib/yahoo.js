// Yahoo Finance fundamentals: analyst ratings, price targets, key stats and financial statements.
// Unofficial, keyless endpoints. Yahoo's "quoteSummary" needs a session cookie + "crumb" token,
// which we fetch anonymously (no account) and reuse for a few hours.

import { UA } from "./sources.js";
let session = null; // { cookie, crumb, at }

let pending = null; // shared in-flight session request, so parallel callers don't each start one

function getSession(force = false) {
  if (!force && session && Date.now() - session.at < 6 * 3600e3) return Promise.resolve(session);
  pending ??= newSession().finally(() => { pending = null; });
  return pending;
}

async function newSession() {
  const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(20000) });
  const cookie = (r1.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Yahoo gave no session cookie");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    signal: AbortSignal.timeout(20000),
  });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes("<")) throw new Error("Yahoo gave no crumb");
  session = { cookie, crumb, at: Date.now() };
  return session;
}

// When Yahoo says "too many requests", every worker pauses together (not just the one that was told),
// with the pause growing each time: 5s, 10s, 20s, 40s, 60s.
let pausedUntil = 0;
const waitForPause = async () => {
  while (Date.now() < pausedUntil) await new Promise((r) => setTimeout(r, pausedUntil - Date.now()));
};

// Calls a Yahoo endpoint that needs the cookie + crumb. Retries once with a fresh session,
// and backs off on 429 (rate limited).
export async function yahooJson(url, { method = "GET", body } = {}) {
  let refreshed = false;
  let force = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    await waitForPause();
    const s = await getSession(force);
    force = false;
    const full = `${url}${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(s.crumb)}`;
    const res = await fetch(full, {
      method,
      headers: { "User-Agent": UA, Cookie: s.cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if ((res.status === 401 || res.status === 403) && !refreshed) { refreshed = force = true; continue; }
    if (res.status === 429) {
      pausedUntil = Math.max(pausedUntil, Date.now() + Math.min(5000 * 2 ** attempt, 60000));
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`Yahoo ${new URL(url).pathname.split("/").slice(0, 4).join("/")} ${res.status}`), { status: res.status });
    return res.json();
  }
  throw new Error("Yahoo kept refusing requests");
}

async function quoteSummary(ticker, modules) {
  const json = await yahooJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules.join(",")}`);
  const r = json.quoteSummary?.result?.[0];
  if (!r) throw new Error(json.quoteSummary?.error?.description || "no data");
  return r;
}

const raw = (v) => (v && typeof v === "object" ? v.raw ?? null : v ?? null);

// Firms shown under the "Big banks" filter.
const BIG_BANKS = [
  "Goldman Sachs", "Morgan Stanley", "JP Morgan", "JPMorgan", "Bank of America", "BofA", "Citigroup", "Citi",
  "Wells Fargo", "UBS", "Barclays", "Deutsche Bank", "HSBC", "BNP Paribas", "Jefferies", "RBC Capital",
  "BMO Capital", "TD Cowen", "Evercore ISI", "Bernstein", "Mizuho", "Truist Securities", "KeyBanc",
];
// Whole-word match, so "Citi" doesn't match "Citizens JMP"
const BIG_BANK_RE = new RegExp(`\\b(${BIG_BANKS.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
export const isBigBank = (firm) => BIG_BANK_RE.test(firm || "");

const ACTIONS = { up: "Upgrade", down: "Downgrade", init: "Initiated", main: "Maintained", reit: "Reiterated" };

export async function getAnalystsAndStats(ticker) {
  const r = await quoteSummary(ticker, [
    "financialData", "recommendationTrend", "upgradeDowngradeHistory", "summaryDetail", "defaultKeyStatistics", "assetProfile",
  ]);
  const fd = r.financialData || {};
  const sd = r.summaryDetail || {};
  const ks = r.defaultKeyStatistics || {};
  const trendNow = r.recommendationTrend?.trend?.find((t) => t.period === "0m") || {};
  const sixMonthsAgo = Date.now() / 1000 - 183 * 86400;

  const actions = (r.upgradeDowngradeHistory?.history || [])
    .filter((h) => h.epochGradeDate > sixMonthsAgo)
    .slice(0, 60)
    .map((h) => ({
      date: new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10),
      firm: h.firm,
      bigBank: isBigBank(h.firm),
      action: ACTIONS[h.action] || h.action,
      fromGrade: h.fromGrade || null,
      toGrade: h.toGrade || null,
      targetAction: h.priceTargetAction || null,
      target: h.currentPriceTarget || null,
      priorTarget: h.priorPriceTarget || null,
    }));

  return {
    profile: r.assetProfile ? {
      sector: r.assetProfile.sector || null,
      industry: r.assetProfile.industry || null,
      country: r.assetProfile.country || null,
      employees: r.assetProfile.fullTimeEmployees ?? null,
      website: r.assetProfile.website || null,
      summary: r.assetProfile.longBusinessSummary || null,
    } : null,
    analysts: {
      consensus: fd.recommendationKey && fd.recommendationKey !== "none" ? fd.recommendationKey : null,
      count: raw(fd.numberOfAnalystOpinions),
      targetMean: raw(fd.targetMeanPrice),
      targetMedian: raw(fd.targetMedianPrice),
      targetHigh: raw(fd.targetHighPrice),
      targetLow: raw(fd.targetLowPrice),
      trend: {
        strongBuy: trendNow.strongBuy ?? 0, buy: trendNow.buy ?? 0, hold: trendNow.hold ?? 0,
        sell: trendNow.sell ?? 0, strongSell: trendNow.strongSell ?? 0,
      },
      actions,
    },
    stats: {
      financialCurrency: fd.financialCurrency || null, // revenue, cash flow etc. are in this currency
      marketCap: raw(sd.marketCap),
      trailingPE: raw(sd.trailingPE),
      forwardPE: raw(sd.forwardPE) ?? raw(ks.forwardPE),
      pegRatio: raw(ks.pegRatio),
      priceToBook: raw(ks.priceToBook),
      dividendYield: raw(sd.dividendYield),
      beta: raw(sd.beta) ?? raw(ks.beta),
      fiftyTwoWeekLow: raw(sd.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: raw(sd.fiftyTwoWeekHigh),
      revenue: raw(fd.totalRevenue),
      revenueGrowth: raw(fd.revenueGrowth),
      earningsGrowth: raw(fd.earningsGrowth),
      grossMargin: raw(fd.grossMargins),
      operatingMargin: raw(fd.operatingMargins),
      profitMargin: raw(fd.profitMargins),
      returnOnEquity: raw(fd.returnOnEquity),
      freeCashflow: raw(fd.freeCashflow),
      totalCash: raw(fd.totalCash),
      totalDebt: raw(fd.totalDebt),
      currentRatio: raw(fd.currentRatio),
    },
  };
}

// Financial statements (last ~4 years and last ~5 quarters). No crumb needed.
const LINES = [
  ["TotalRevenue", "Revenue"],
  ["GrossProfit", "Gross profit"],
  ["OperatingIncome", "Operating income"],
  ["NetIncome", "Net income"],
  ["DilutedEPS", "EPS (diluted)"],
  ["OperatingCashFlow", "Operating cash flow"],
  ["FreeCashFlow", "Free cash flow"],
  ["CashAndCashEquivalents", "Cash"],
  ["TotalDebt", "Total debt"],
  ["StockholdersEquity", "Shareholders' equity"],
];

export async function getStatements(ticker) {
  const types = LINES.flatMap(([k]) => [`annual${k}`, `quarterly${k}`]).join(",");
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}?type=${types}&period1=${now - 6 * 365 * 86400}&period2=${now}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Yahoo timeseries ${res.status}`);
  const json = await res.json();

  const series = {};
  let currency = null;
  for (const r of json.timeseries?.result || []) {
    const type = r.meta?.type?.[0];
    if (!type || !r[type]) continue;
    series[type] = r[type].filter(Boolean).map((p) => ({ date: p.asOfDate, value: p.reportedValue?.raw ?? null }));
    currency ??= r[type].find((p) => p?.currencyCode)?.currencyCode;
  }

  const build = (prefix, keep) => {
    const dates = [...new Set(LINES.flatMap(([k]) => (series[prefix + k] || []).map((p) => p.date)))].sort().slice(-keep);
    const rows = LINES.map(([k, label]) => ({
      key: k,
      label,
      perShare: k === "DilutedEPS",
      values: dates.map((d) => series[prefix + k]?.find((p) => p.date === d)?.value ?? null),
    })).filter((row) => row.values.some((v) => v != null));
    return { dates, rows };
  };

  return { currency, annual: build("annual", 4), quarterly: build("quarterly", 5) };
}

// Options chain for the first expiry 30–75 days out (US stocks only). The backup source: Tradier
// (lib/tradier.js) is used first when a token is set.
// After the US close Yahoo zeroes bid, ask, open interest and implied volatility, so the app works from
// the last traded price and the session's volume, and calculates volatility itself (lib/options.js).
export async function getOptionChain(ticker, { minDays = 30, maxDays = 75 } = {}) {
  const base = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`;
  const first = (await yahooJson(base)).optionChain?.result?.[0];
  if (!first?.expirationDates?.length) return null;
  const now = Date.now() / 1000;
  const expiry = first.expirationDates.find((d) => d - now >= minDays * 86400 && d - now <= maxDays * 86400);
  if (!expiry) return null;
  const r = (await yahooJson(`${base}?date=${expiry}`)).optionChain?.result?.[0];
  const o = r?.options?.[0];
  if (!o) return null;
  const price = r.quote?.regularMarketPrice;
  // Keep strikes within 25% of the price, on standard 50-cent steps. Odd strikes like 9.67 are contracts
  // adjusted after a special dividend or merger, which don't cover a plain 100 shares.
  const keep = (c) => c.contractSize === "REGULAR" && Number.isInteger(Math.round(c.strike * 1000) / 500) &&
    (!price || Math.abs(c.strike / price - 1) <= 0.25);
  const slim = (c) => ({
    contract: c.contractSymbol,
    strike: c.strike,
    last: c.lastPrice ?? null,
    bid: c.bid ?? 0,
    ask: c.ask ?? 0,
    volume: c.volume ?? 0,
    openInterest: c.openInterest ?? 0,
    lastTrade: c.lastTradeDate ? new Date(c.lastTradeDate * 1000).toISOString() : null,
  });
  return {
    expiry: new Date(expiry * 1000).toISOString().slice(0, 10),
    source: "Yahoo",
    calls: (o.calls || []).filter(keep).map(slim),
    puts: (o.puts || []).filter(keep).map(slim),
  };
}
