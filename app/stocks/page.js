"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MarketPulse from "@/components/MarketPulse";
import { Star, useFavorites } from "@/lib/favorites";
import { big, CONSENSUS, isNum, loadIndex, money, pct, startAutoRefresh, stockHref, STORE, timeAgo } from "@/lib/format";

const TABS = [["FAV", "★ Favourites"], ["ALL", "All"], ["US", "US"], ["HK", "Hong Kong"], ["SG", "Singapore"]];
const PAGE = 50;
const B = 1e9;

// Ready-made lists, like the "movers" and screener presets in broker apps.
// Size floors keep tiny, thinly traded stocks from swamping the lists.
const LISTS = {
  "": { label: "All stocks" },
  gainers: { label: "Top gainers", filter: (s) => s.marketCapUsd >= 0.3 * B && s.changePct > 0, sort: "changeDesc" },
  losers: { label: "Top losers", filter: (s) => s.marketCapUsd >= 0.3 * B && s.changePct < 0, sort: "changeAsc" },
  active: { label: "Most traded", filter: (s) => isNum(s.tradedUsd), sort: "traded" },
  high52: { label: "Near 52-week high", filter: (s) => isNum(s.high52) && s.price >= s.high52 * 0.97 && s.marketCapUsd >= 0.3 * B, sort: "mcap" },
  low52: { label: "Near 52-week low", filter: (s) => isNum(s.low52) && s.price <= s.low52 * 1.03 && s.marketCapUsd >= 0.3 * B, sort: "mcap" },
  upside: { label: "Biggest analyst upside", filter: (s) => isNum(s.upside) && s.marketCapUsd >= 2 * B, sort: "upside" },
  dividend: { label: "High dividend", filter: (s) => s.divYield > 0 && s.divYield < 0.25 && s.marketCapUsd >= 1 * B, sort: "dividend" },
  value: { label: "Low P/E", filter: (s) => s.pe > 0 && s.marketCapUsd >= 2 * B, sort: "peAsc" },
};

const SORTS = {
  mcap: ["Market cap (largest)", (a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1)],
  az: ["Name A–Z", (a, b) => a.name.localeCompare(b.name)],
  za: ["Name Z–A", (a, b) => b.name.localeCompare(a.name)],
  symbol: ["Ticker A–Z", (a, b) => a.symbol.localeCompare(b.symbol, "en", { numeric: true })],
  changeDesc: ["Day change (best)", (a, b) => (b.changePct ?? -1e9) - (a.changePct ?? -1e9)],
  changeAsc: ["Day change (worst)", (a, b) => (a.changePct ?? 1e9) - (b.changePct ?? 1e9)],
  traded: ["Value traded today", (a, b) => (b.tradedUsd ?? -1) - (a.tradedUsd ?? -1)],
  upside: ["Analyst upside", (a, b) => (b.upside ?? -1e9) - (a.upside ?? -1e9)],
  dividend: ["Dividend yield", (a, b) => (b.divYield ?? -1) - (a.divYield ?? -1)],
  peAsc: ["P/E (lowest)", (a, b) => (a.pe > 0 ? a.pe : 1e9) - (b.pe > 0 ? b.pe : 1e9)],
};

const SIZES = {
  "": ["Any size", () => true],
  mega: ["Mega (over $200B)", (v) => v >= 200 * B],
  large: ["Large ($10B–200B)", (v) => v >= 10 * B && v < 200 * B],
  mid: ["Mid ($2B–10B)", (v) => v >= 2 * B && v < 10 * B],
  small: ["Small ($300M–2B)", (v) => v >= 0.3 * B && v < 2 * B],
  micro: ["Micro (under $300M)", (v) => v < 0.3 * B],
};

const RATINGS = { "": "Any rating", buyish: "Buy or strong buy", strong_buy: "Strong buy", buy: "Buy", hold: "Hold", sellish: "Underperform or sell" };

const PREFS_KEY = `${STORE}screener:v1`;
const DEFAULTS = { market: "ALL", list: "", sort: "mcap", sector: "", size: "", rating: "" };

export default function Home() {
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [f, setF] = useState(DEFAULTS);
  const [shown, setShown] = useState(PAGE);
  const favs = useFavorites();

  // Restore the last-used tab, sort and filters
  useEffect(() => {
    try {
      const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
      // Ignore saved choices that no longer exist (e.g. after an update renamed a filter)
      const valid = {
        market: TABS.some(([k]) => k === saved.market), list: saved.list in LISTS, sort: saved.sort in SORTS,
        size: saved.size in SIZES, rating: saved.rating in RATINGS, sector: typeof saved.sector === "string",
      };
      setF(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, valid[k] === false ? DEFAULTS[k] : v])));
    } catch {}
  }, []);
  const set = (patch) => setF((prev) => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });

  useEffect(() => {
    const load = (refresh) => loadIndex({ refresh }).then((d) => { setIndex(d); setError(false); }).catch(() => setError(true));
    load(false);
    return startAutoRefresh(() => load(true));
  }, []);

  const stocks = index?.stocks || [];
  const counts = useMemo(() => {
    const c = { FAV: 0, ALL: stocks.length, US: 0, HK: 0, SG: 0 };
    for (const s of stocks) c[s.market]++;
    c.FAV = stocks.filter((s) => favs.includes(s.symbol)).length;
    return c;
  }, [stocks, favs]);

  const sectors = useMemo(() => [...new Set(stocks.map((s) => s.sector).filter(Boolean))].sort(), [stocks]);

  // Search matches across all markets (the tab narrows them afterwards)
  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return stocks;
    const score = (s) => {
      const sym = s.symbol.toLowerCase();
      const bare = sym.replace(/\.(hk|si)$/, "").replace(/^0+/, "");
      if (sym === query || bare === query.replace(/^0+/, "")) return 0;
      if (sym.startsWith(query)) return 1;
      if (s.name.toLowerCase().startsWith(query)) return 2;
      if (s.name.toLowerCase().includes(query)) return 3;
      return 9;
    };
    return stocks.map((s) => [score(s), s]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  }, [stocks, query]);

  const inTab = (s) => f.market === "ALL" || (f.market === "FAV" ? favs.includes(s.symbol) : s.market === f.market);

  const results = useMemo(() => {
    const list = LISTS[f.list] || LISTS[""];
    const out = matches.filter((s) =>
      inTab(s) &&
      (!list.filter || list.filter(s)) &&
      (!f.sector || s.sector === f.sector) &&
      (!f.size || (isNum(s.marketCapUsd) && SIZES[f.size]?.[1](s.marketCapUsd))) &&
      (!f.rating || ratingMatches(s.consensus, f.rating))
    );
    // A search keeps best-match order unless you picked a sort yourself
    if (!query || f.sort !== "mcap") out.sort(SORTS[f.sort]?.[1] || SORTS.mcap[1]);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, f, favs, query]);

  useEffect(() => setShown(PAGE), [q, f]);

  const otherMarketHits = f.market !== "ALL" && query ? matches.length - matches.filter(inTab).length : 0;
  const filtersOn = f.list || f.sector || f.size || f.rating;

  return (
    <>
      <section className="card">
        <h1>Make a call. Find out if you were right.</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Pick any US, Hong Kong or Singapore stock, read the news, analyst views and financials, then write down what you
          think will happen and why. Your call gets graded when its check-back date comes.
        </p>
      </section>

      {index && <MarketPulse stocks={stocks.filter((s) => f.market === "ALL" || f.market === "FAV" || s.market === f.market)}
        activeSector={f.sector} onPickSector={(sector) => set({ sector })} />}

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Stocks</h2>
          {index && <span className="small muted">{counts.ALL.toLocaleString()} stocks · prices updated {timeAgo(index.updatedAt)}</span>}
        </div>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or company, e.g. AAPL, 700, DBS"
          aria-label="Search stocks" />

        <div className="seg wrap" role="group" aria-label="Market" style={{ marginTop: 10 }}>
          {TABS.map(([k, label]) => (
            <button key={k} type="button" className={f.market === k ? "on" : ""} onClick={() => set({ market: k })}>
              {label}{index && <span className="count"> {counts[k].toLocaleString()}</span>}
            </button>
          ))}
        </div>

        <div className="chips" style={{ marginTop: 10 }}>
          {Object.entries(LISTS).map(([k, l]) => (
            <button key={k} type="button" className={`chip ${f.list === k ? "on" : ""}`}
              onClick={() => set({ list: k, sort: LISTS[k].sort || "mcap" })}>{l.label}</button>
          ))}
        </div>

        <div className="filters">
          <select aria-label="Sector" value={f.sector} onChange={(e) => set({ sector: e.target.value })}>
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Company size" value={f.size} onChange={(e) => set({ size: e.target.value })}>
            {Object.entries(SIZES).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select aria-label="Analyst rating" value={f.rating} onChange={(e) => set({ rating: e.target.value })}>
            {Object.entries(RATINGS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select aria-label="Sort by" value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
            {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>Sort: {label}</option>)}
          </select>
          {filtersOn && <button type="button" className="ghost" onClick={() => set({ list: "", sector: "", size: "", rating: "", sort: "mcap" })}>Clear filters</button>}
        </div>

        {error && <p className="notice" style={{ marginTop: 12 }}>Couldn&apos;t load stock data. Try refreshing in a minute.</p>}
        {!index && !error && <p className="muted">Loading…</p>}

        {index && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>{results.length.toLocaleString()} stocks</div>
            <table>
              <thead>
                <tr>
                  <th aria-label="Favourite"></th><th>Stock</th><th className="r">Price</th><th className="r">Day</th>
                  <th className="r hide-sm">Market cap</th><th className="hide-sm">Sector</th><th>Analysts</th><th className="r hide-sm">Upside</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, shown).map((s) => (
                  <tr key={s.symbol}>
                    <td className="star-cell"><Star symbol={s.symbol} favs={favs} /></td>
                    <td>
                      <Link href={stockHref(s.symbol)}><strong>{s.symbol}</strong></Link>
                      <div className="small muted clip">{s.name}</div>
                    </td>
                    <td className="r nowrap">{money(s.price, 2, s.currency)}</td>
                    <td className={`r ${isNum(s.changePct) ? (s.changePct >= 0 ? "up" : "down") : ""}`}>
                      {pct(s.changePct, { signed: true, digits: 2 })}
                    </td>
                    <td className="r hide-sm nowrap" title={isNum(s.marketCapUsd) && s.currency !== "USD" ? `≈ ${big(s.marketCapUsd)}` : undefined}>
                      {big(s.marketCap, s.currency)}
                    </td>
                    <td className="hide-sm small muted clip-sector">{s.sector || "—"}</td>
                    <td>{s.consensus ? <span className={`pill ${s.consensus}`}>{CONSENSUS[s.consensus]}</span> : <span className="muted small">—</span>}</td>
                    <td className={`r hide-sm small ${isNum(s.upside) ? (s.upside >= 0 ? "up" : "down") : ""}`}>{pct(s.upside, { signed: true })}</td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr><td colSpan={8} className="muted">
                    {f.market === "FAV" && counts.FAV === 0
                      ? <>No favourites yet. Tap ☆ next to any stock to add it here.</>
                      : <>No stocks match{query ? <> &quot;{q}&quot;</> : null}{filtersOn ? " with these filters" : ""}.</>}
                    {otherMarketHits > 0 && (
                      <> <button type="button" className="link inline" onClick={() => set({ market: "ALL" })}>
                        Show {otherMarketHits} match{otherMarketHits === 1 ? "" : "es"} in other markets
                      </button></>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
            {results.length > shown && (
              <button type="button" className="ghost" style={{ marginTop: 12, width: "100%" }} onClick={() => setShown(shown + PAGE * 2)}>
                Show more ({(results.length - shown).toLocaleString()} left)
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function ratingMatches(consensus, want) {
  if (want === "buyish") return consensus === "buy" || consensus === "strong_buy";
  if (want === "sellish") return consensus === "underperform" || consensus === "sell";
  return consensus === want;
}
