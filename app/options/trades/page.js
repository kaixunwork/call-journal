"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONFIDENCE_LABEL, RULES, daysTo } from "@/lib/options";
import { isNum, loadIndex, loadStock, money, pct, startAutoRefresh, stockHref, timeAgo } from "@/lib/format";
import { deleteTrade, isExpired, loadTrades, settleTrade, tradeResult } from "@/lib/paper";

export default function TradesPage() {
  const [trades, setTrades] = useState(null);
  const [index, setIndex] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const all = loadTrades();
    setTrades(all);
    const load = (refresh) => loadIndex({ refresh }).then((d) => { setIndex(d); setLoadFailed(false); }).catch(() => setLoadFailed(true));
    load(false);
    // Settle expired trades using the stock's close on expiry day
    const due = all.filter((t) => !t.settledAt && isExpired(t));
    for (const sym of new Set(due.map((t) => t.symbol))) {
      loadStock(sym).then((d) => {
        let updated = null;
        const closedThrough = d.detailUpdatedAt?.slice(0, 10);
        for (const t of due.filter((x) => x.symbol === sym)) updated = settleTrade(t.id, d.history, closedThrough) || updated;
        if (updated) setTrades(updated);
      }).catch(() => {});
    }
    return startAutoRefresh(() => load(true));
  }, []);

  if (!trades) return null;
  if (!trades.length) {
    return (
      <div className="card">
        <p className="small" style={{ margin: "0 0 8px" }}><Link href="/options/">← Learn options</Link></p>
        <h1>Paper trades</h1>
        <p className="muted">No paper trades yet. <Link href="/options/ideas/">Pick an option idea</Link> and paper trade it.</p>
      </div>
    );
  }

  const prices = Object.fromEntries((index?.stocks || []).map((s) => [s.symbol, s.price]));
  const rows = trades.map((t) => ({ t, r: tradeResult(t, prices[t.symbol]) }));
  const settled = rows.filter((x) => x.r.settled);
  const wins = settled.filter((x) => x.r.pnl > 0).length;
  const totalPnl = settled.reduce((s, x) => s + x.r.pnl, 0);
  const openRows = rows.filter((x) => !x.r.settled);
  const openPnl = openRows.filter((x) => isNum(x.r.pnl)).reduce((s, x) => s + x.r.pnl, 0);

  return (
    <>
      <p className="small" style={{ margin: "0 0 8px" }}><Link href="/options/">← Learn options</Link></p>
      <h1>Paper trades</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Open trades are <strong>estimated</strong> from the stock&apos;s latest price. At expiry each trade settles exactly, at
        what the option is worth at the expiry-day close. No real money involved.
        {index && <> Prices updated {timeAgo(index.updatedAt)}.</>}
      </p>
      {loadFailed && <p className="notice">Couldn&apos;t load current prices, so open trades can&apos;t be valued right now.</p>}

      <section className="card stats">
        <Stat value={settled.length ? `${Math.round((wins / settled.length) * 100)}%` : "—"} label={`Settled trades that made money (${wins}/${settled.length})`} />
        <Stat value={settled.length ? usd(totalPnl) : "—"} cls={settled.length ? sign(totalPnl) : ""} label="Settled profit / loss" />
        <Stat value={openRows.length} label="Open trades" />
        <Stat value={openRows.length && index ? usd(openPnl) : "—"} cls={openRows.length && index ? sign(openPnl) : ""} label="Open, estimated" />
      </section>

      <Hypothesis rows={rows} />

      <section className="card table-wrap">
        <table>
          <thead>
            <tr><th>Option</th><th>Confidence</th><th className="r">Paid</th><th className="r">Worth now</th><th className="r">P/L</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(({ t, r }) => (
              <tr key={t.id}>
                <td>
                  <Link href={stockHref(t.symbol)}><strong>{t.symbol}</strong></Link>{" "}
                  <span className={t.side === "call" ? "up" : "down"}>{t.side}</span>{" "}
                  {money(t.strike, 2, t.currency)}
                  <div className="small muted">exp {t.expiry} · {t.contracts}× · stock was {money(t.stockAtEntry, 2, t.currency)}</div>
                  {t.rulesFailed?.length > 0 && <div className="small muted">failed rule {t.rulesFailed.map((x) => RULES[x]?.n).join(", ")}</div>}
                </td>
                <td><span className={`conf ${t.confidence}`}>{cap(t.confidence)}</span></td>
                <td className="r nowrap">{money(t.premium, 2, t.currency)}</td>
                <td className="r nowrap">
                  {isNum(r.value) ? money(r.value, 2, t.currency) : index ? "—" : "…"}
                  <div className="small muted">{r.settled ? `close ${money(t.stockAtExpiry, 2, t.currency)}` : isNum(prices[t.symbol]) ? `stock ${money(prices[t.symbol], 2, t.currency)}` : ""}</div>
                </td>
                <td className={`r nowrap ${isNum(r.pnl) ? sign(r.pnl) : ""}`}>
                  {isNum(r.pnl) ? usd(r.pnl) : "—"}
                  <div className="small">{pct(r.pnlPct, { signed: true, digits: 0 })}</div>
                </td>
                <td className="small">
                  {r.settled
                    ? <strong className={r.pnl > 0 ? "up" : "down"}>{r.pnl > 0 ? "✓ Made money" : "✗ Lost money"}</strong>
                    : isExpired(t) ? <span className="muted">Expired, settling…</span>
                    : <span className="muted">{daysTo(t.expiry)} days left<br />estimate</span>}
                </td>
                <td>
                  <button className="link" onClick={() => confirm(`Delete your ${t.symbol} paper trade?`) && setTrades(deleteTrade(t.id))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

// The bot's hypothesis: higher-confidence ideas do better. Settled trades only; open ones shown separately.
function Hypothesis({ rows }) {
  const levels = ["high", "medium", "low"].map((level) => {
    const mine = rows.filter((x) => x.t.confidence === level);
    const settled = mine.filter((x) => x.r.settled);
    const wins = settled.filter((x) => x.r.pnl > 0).length;
    const avg = settled.length ? settled.reduce((s, x) => s + x.r.pnlPct, 0) / settled.length : null;
    return { level, total: mine.length, settled: settled.length, wins, avg };
  });
  const settledTotal = levels.reduce((s, l) => s + l.settled, 0);
  const hi = levels[0], lo = levels[2];
  let verdict;
  if (settledTotal < 20) verdict = `Too early to tell: ${settledTotal} settled trade${settledTotal === 1 ? "" : "s"}. Aim for 20–30 before reading much into it.`;
  else if (!hi.settled || !lo.settled) verdict = "Need settled trades at both high and low confidence to compare.";
  else if (hi.avg > lo.avg) verdict = `So far it holds: high-confidence trades averaged ${pct(hi.avg, { signed: true })} against ${pct(lo.avg, { signed: true })} for low.`;
  else verdict = `So far it doesn't hold: high-confidence trades averaged ${pct(hi.avg, { signed: true })} against ${pct(lo.avg, { signed: true })} for low. The rules may need changing.`;

  return (
    <section className="card">
      <h2>Does confidence predict results?</h2>
      <p className="small muted" style={{ marginTop: 0 }}>The rules&apos; hypothesis is that high-confidence ideas do better than low-confidence ones.</p>
      <table>
        <thead><tr><th>Confidence</th><th className="r">Trades</th><th className="r">Settled</th><th className="r">Made money</th><th className="r">Avg return</th></tr></thead>
        <tbody>
          {levels.map((l) => (
            <tr key={l.level}>
              <td><span className={`conf ${l.level}`}>{CONFIDENCE_LABEL[l.level]}</span></td>
              <td className="r">{l.total}</td>
              <td className="r">{l.settled}</td>
              <td className="r">{l.settled ? `${l.wins}/${l.settled}` : "—"}</td>
              <td className={`r ${l.avg == null ? "" : sign(l.avg)}`}>{pct(l.avg, { signed: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small" style={{ marginBottom: 0 }}>{verdict}</p>
    </section>
  );
}

function Stat({ value, label, cls = "" }) {
  return <div className="stat"><div className={`num ${cls}`}>{value}</div><div className="small muted">{label}</div></div>;
}

const usd = (n) => (Math.round(n) === 0 ? "$0" : `${n > 0 ? "+" : ""}${money(n, 0, "USD", false)}`);
const sign = (n) => (n >= 0 ? "up" : "down");
const cap = (s) => s[0].toUpperCase() + s.slice(1);
