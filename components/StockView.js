"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Sparkline from "@/components/Sparkline";
import CallForm from "@/components/CallForm";
import Analysts from "@/components/Analysts";
import Financials from "@/components/Financials";
import KeyStats from "@/components/KeyStats";
import News from "@/components/News";
import ClaudeTake from "@/components/ClaudeTake";
import { Star, useFavorites } from "@/lib/favorites";
import { loadCalls } from "@/lib/calls";
import { isNum, loadStock, MARKET_NAMES, money, pct, startAutoRefresh, timeAgo } from "@/lib/format";

const RANGES = [["1M", 22], ["3M", 66], ["6M", 999]];

export default function StockView({ symbol }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState("3M");
  const [pastCalls, setPastCalls] = useState([]);
  const favs = useFavorites();

  useEffect(() => {
    let loaded = false;
    // A failed background refresh keeps the page (and anything typed in the call form) as it is
    const load = () => loadStock(symbol)
      .then((d) => { loaded = true; setData(d); setError(null); })
      .catch((e) => { if (!loaded) setError(e.message); });
    load();
    setPastCalls(loadCalls().filter((c) => c.symbol === symbol));
    return startAutoRefresh(load); // prices refresh while the page is open
  }, [symbol]);

  if (error) {
    return (
      <div className="card">
        {error === "not-found"
          ? <>We don&apos;t have data for <strong>{symbol}</strong>. It may not be a US, Hong Kong or Singapore stock, or it may not have traded recently.</>
          : <>Couldn&apos;t load {symbol}. Try refreshing.</>}{" "}
        <Link href="/stocks/">Back to search</Link>
      </div>
    );
  }
  if (!data) return <div className="card muted">Loading {symbol}…</div>;

  const { quote } = data;
  const ccy = quote.currency;
  const points = data.history.slice(-RANGES.find(([r]) => r === range)[1]);
  const googleNews = `https://news.google.com/search?q=${encodeURIComponent(`${quote.name} stock`)}`;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="row" style={{ gap: 6 }}>{symbol} <Star symbol={symbol} favs={favs} size={22} /></h1>
          <div className="muted">{quote.name}</div>
          <div className="small muted">{quote.exchange} · {MARKET_NAMES[data.market]} · prices in {ccy}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="price">{money(quote.price, 2, ccy)}</div>
          {isNum(quote.change) && (
            <div className={quote.change >= 0 ? "up" : "down"}>
              {quote.change >= 0 ? "+" : ""}{money(quote.change, quote.price < 1 ? 3 : 2, ccy, false)} ({pct(quote.changePct, { signed: true, digits: 2 })})
            </div>
          )}
          <div className="small muted" title={quote.asOf ? `Last trade ${new Date(quote.asOf).toLocaleString()}` : undefined}>
            Price as of {quote.asOf ? timeAgo(quote.asOf) : "—"} · may be delayed
          </div>
          <a href="#make-call" className="small jump">Make a call ↓</a>
        </div>
      </div>

      {!data.full && (
        <p className="notice">
          Only basic data so far for this stock (it may be newly listed, or a source failed during the last daily update).{" "}
          <a href={googleNews} target="_blank" rel="noreferrer">Search news for {quote.name} ↗</a>
        </p>
      )}

      <div className="grid">
        <div className="col">
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>Price</h2>
              <div className="seg" role="group" aria-label="Chart range">
                {RANGES.map(([r]) => (
                  <button key={r} type="button" className={r === range ? "on" : ""} onClick={() => setRange(r)}>{r}</button>
                ))}
              </div>
            </div>
            {points.length > 1 ? <Sparkline points={points} currency={ccy} /> : <p className="muted small">No chart data.</p>}
          </section>

          {data.profile && <Profile profile={data.profile} />}
          <KeyStats stats={data.stats} price={quote.price} currency={ccy} />
          <Analysts analysts={data.analysts} analystNews={data.analystNews} price={quote.price} currency={ccy} full={data.full} market={data.market} />
          {data.full && <Financials statements={data.statements} />}
          {data.full && <News items={data.news} />}
        </div>

        <div className="col side" id="make-call">
          <ClaudeTake data={data} myCalls={pastCalls} />
          <CallForm symbol={symbol} quote={quote} onSaved={() => setPastCalls(loadCalls().filter((c) => c.symbol === symbol))} />
          {pastCalls.length > 0 && (
            <section className="card">
              <h2>Your calls on {symbol}</h2>
              {pastCalls.map((c) => (
                <div key={c.id} className="small" style={{ marginBottom: 8 }}>
                  <span className={c.direction === "bull" ? "up" : "down"}>
                    {c.direction === "bull" ? "▲ Bullish" : "▼ Bearish"}
                  </span>{" "}
                  at {money(c.entryPrice, 2, c.currency || ccy)} · {new Date(c.createdAt).toLocaleDateString()}
                </div>
              ))}
              <Link href="/calls/" className="small">See scorecard →</Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Profile({ profile: p }) {
  const [open, setOpen] = useState(false);
  const summary = p.summary || "";
  return (
    <section className="card">
      <h2>About</h2>
      <div className="row small muted" style={{ gap: 14, marginBottom: summary ? 8 : 0 }}>
        {p.sector && <span>{p.sector}{p.industry ? ` · ${p.industry}` : ""}</span>}
        {p.country && <span>{p.country}</span>}
        {isNum(p.employees) && <span>{p.employees.toLocaleString()} employees</span>}
        {p.website && /^https?:\/\//.test(p.website) && <a href={p.website} target="_blank" rel="noreferrer">Website ↗</a>}
      </div>
      {summary && (
        <p className="small" style={{ margin: 0 }}>
          {open || summary.length < 360 ? summary : `${summary.slice(0, 340).trim()}… `}
          {summary.length >= 360 && <button type="button" className="link inline" onClick={() => setOpen(!open)}>{open ? " Show less" : "Read more"}</button>}
        </p>
      )}
    </section>
  );
}
