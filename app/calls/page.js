"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Backup from "@/components/Backup";
import { deleteCall, dueDate, grade, loadCalls, settleCall } from "@/lib/calls";
import { isNum, loadIndex, loadStock, money, pct, startAutoRefresh, stockHref, timeAgo } from "@/lib/format";

export default function CallsPage() {
  const [calls, setCalls] = useState(null);
  const [index, setIndex] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const all = loadCalls();
    setCalls(all);
    const load = (refresh) => loadIndex({ refresh }).then((d) => { setIndex(d); setLoadFailed(false); }).catch(() => setLoadFailed(true));
    load(false);
    // Lock in the check-back-day price for calls that are due, using each stock's daily closes
    const due = all.filter((c) => c.exitPrice == null && Date.now() >= dueDate(c).getTime());
    for (const sym of new Set(due.map((c) => c.symbol))) {
      loadStock(sym).then((d) => {
        let updated = null;
        const closedThrough = d.detailUpdatedAt?.slice(0, 10); // date of the last full run (final closes)
        for (const c of due.filter((x) => x.symbol === sym)) updated = settleCall(c.id, d.history, closedThrough);
        if (updated) setCalls(updated);
      }).catch(() => {});
    }
    return startAutoRefresh(() => load(true));
  }, []);

  if (!calls) return null;

  if (calls.length === 0) {
    return (
      <>
      <div className="card">
        <h1>My calls</h1>
        <p className="muted">No calls yet. <Link href="/stocks/">Pick a stock</Link> and make your first one.</p>
      </div>
      <Backup onRestored={() => setCalls(loadCalls())} />
      </>
    );
  }

  const prices = Object.fromEntries((index?.stocks || []).map((s) => [s.symbol, s.price]));
  const rows = calls.map((c) => ({ call: c, g: grade(c, prices[c.symbol]) }));
  const resolved = rows.filter((r) => !r.g.open && r.g.right != null);
  const open = rows.filter((r) => r.g.open && r.g.movePct != null);
  const hits = resolved.filter((r) => r.g.right).length;
  const openRight = open.filter((r) => r.g.right).length;
  const avgYourWay = resolved.length ? resolved.reduce((s, r) => s + r.g.yourWayPct, 0) / resolved.length : null;

  return (
    <>
      <h1>My calls</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        A call is graded once its check-back date has passed.
        {index && <> Prices updated {timeAgo(index.updatedAt)}.</>}
      </p>

      {loadFailed && <p className="notice">Couldn&apos;t load current prices, so calls can&apos;t be graded right now.</p>}

      <section className="card stats">
        <div className="stat">
          <div className="num">{resolved.length ? `${Math.round((hits / resolved.length) * 100)}%` : "—"}</div>
          <div className="small muted">Hit rate ({hits}/{resolved.length} graded)</div>
        </div>
        <div className="stat">
          <div className={`num ${avgYourWay == null ? "" : avgYourWay >= 0 ? "up" : "down"}`}>{pct(avgYourWay, { signed: true })}</div>
          <div className="small muted">Avg move your way</div>
        </div>
        <div className="stat">
          <div className="num">{rows.filter((r) => r.g.open).length}</div>
          <div className="small muted">Open calls</div>
        </div>
        <div className="stat">
          <div className="num">{open.length ? `${openRight}/${open.length}` : "—"}</div>
          <div className="small muted">Open calls right so far</div>
        </div>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr><th>Stock</th><th>Call</th><th className="r">Entry</th><th className="r">Now / exit</th><th className="r">Moved</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(({ call: c, g }) => (
              <tr key={c.id}>
                <td>
                  <Link href={stockHref(c.symbol)}><strong>{c.symbol}</strong></Link>
                  <div className="small muted">{new Date(c.createdAt).toLocaleDateString()}</div>
                </td>
                <td style={{ minWidth: 200, maxWidth: 320 }}>
                  <span className={c.direction === "bull" ? "up" : "down"}>
                    {c.direction === "bull" ? "▲ Bullish" : "▼ Bearish"}
                  </span>
                  <div className="small">{c.reason}</div>
                  {c.links?.map((l) => <div key={l} className="small"><a href={l} target="_blank" rel="noreferrer">{hostname(l)}</a></div>)}
                </td>
                <td className="r nowrap">{money(c.entryPrice, 2, c.currency)}</td>
                <td className="r nowrap">
                  {c.exitPrice != null
                    ? <>{money(c.exitPrice, 2, c.currency)}<div className="small muted">close {c.exitDate}</div></>
                    : isNum(prices[c.symbol]) ? money(prices[c.symbol], 2, c.currency) : index ? "—" : "…"}
                </td>
                <td className={`r ${g.movePct == null ? "" : g.movePct >= 0 ? "up" : "down"}`}>{pct(g.movePct, { signed: true })}</td>
                <td className="small">{status(g, index)}</td>
                <td>
                  <button className="link" onClick={() => confirm(`Delete your ${c.symbol} call?`) && setCalls(deleteCall(c.id))}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Backup onRestored={() => setCalls(loadCalls())} />
    </>
  );
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function status(g, index) {
  const verdict = g.flat ? "flat" : g.right == null ? null : g.right ? "right" : "wrong";
  if (g.open) {
    return <span className="muted">Open until {g.due.toLocaleDateString()}{verdict && <><br />{verdict} so far</>}</span>;
  }
  if (!verdict) return <span className="muted">{index ? "No price" : "…"}</span>;
  if (g.flat) return <span className="muted">Flat</span>;
  return <strong className={g.right ? "up" : "down"}>{g.right ? "✓ Right" : "✗ Wrong"}</strong>;
}
