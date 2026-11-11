"use client";

// Every call the bot made: what it would buy, what it paid, what it predicted, and how it turned out.
// entries: ledger entries, newest first: { date, symbol, side, strike, expiry, premium, predict, confidence,
//   ev, outcome (null | "Y" | "N" | "void"), returnPct, hyp, settledOn }
import { useMemo, useState } from "react";

const PAGE = 25;

export default function CallsTable({ entries, hypotheses = null, title = "All its calls", note = null }) {
  const [status, setStatus] = useState("all");
  const [pred, setPred] = useState("all");
  const [hyp, setHyp] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const hyps = useMemo(() => hypotheses || [...new Set(entries.map((e) => e.hyp))].sort((a, b) => +a.slice(1) - +b.slice(1)), [entries, hypotheses]);
  const rows = entries.filter((e) => e.outcome !== "void" &&
    (status === "all" || (status === "open" ? !e.outcome : !!e.outcome)) &&
    (pred === "all" || e.predict === pred) &&
    (hyp === "all" || e.hyp === hyp));
  const settled = rows.filter((e) => e.outcome);
  const right = settled.filter((e) => e.outcome === e.predict).length;
  const reset = () => setShown(PAGE);

  return (
    <section className="card table-wrap calls-table">
      <h2>{title}</h2>
      {note && <p className="small muted" style={{ marginTop: 0 }}>{note}</p>}
      <div className="filters">
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="all">Open and settled</option>
          <option value="open">Still open</option>
          <option value="settled">Settled</option>
        </select>
        <select aria-label="Prediction" value={pred} onChange={(e) => { setPred(e.target.value); reset(); }}>
          <option value="all">Y and N calls</option>
          <option value="Y">Y: expects profit</option>
          <option value="N">N: expects a loss</option>
        </select>
        {hyps.length > 1 && (
          <select aria-label="Hypothesis" value={hyp} onChange={(e) => { setHyp(e.target.value); reset(); }}>
            <option value="all">Every rule set</option>
            {hyps.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        )}
      </div>
      <p className="small" style={{ margin: "10px 0" }}>
        {rows.length} call{rows.length === 1 ? "" : "s"}
        {settled.length > 0 && <> · {settled.length} settled, <strong className={right / settled.length >= 0.5 ? "up" : "down"}>{right} right ({Math.round((right / settled.length) * 100)}%)</strong></>}
        {rows.length - settled.length > 0 && <> · {rows.length - settled.length} still open</>}
      </p>
      {rows.length === 0 ? <p className="small muted">No calls match.</p> : (
        <table>
          <thead>
            <tr><th>Logged</th><th>Option</th><th className="r">Paid</th><th>Called</th><th>Result</th><th className="r">Return</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((e, i) => (
              <tr key={`${e.hyp}-${e.symbol}-${e.expiry}-${i}`}>
                <td className="small nowrap">{e.date}<div className="muted">{e.hyp}</div></td>
                <td className="small"><strong>{e.symbol}</strong> <span className={e.side === "call" ? "up" : "down"}>{e.side}</span> {e.strike}<div className="muted">expires {e.expiry}</div></td>
                <td className="small r nowrap">${e.premium.toFixed(2)}<div className="muted">${Math.round(e.premium * 100)}/contract</div></td>
                <td className="small"><span className={`yn ${e.predict}`}>{e.predict}</span> {e.predict === "Y" ? "profit" : "loss"}<div className="muted">{e.confidence}{e.ev != null ? ` · EV ${e.ev >= 0 ? "+" : ""}${Math.round(e.ev * 100)}%` : ""}</div></td>
                <td className="small nowrap">
                  {!e.outcome ? <span className="muted">open</span> : (
                    <><span className={`yn ${e.outcome}`}>{e.outcome}</span> {e.outcome === e.predict ? <span className="up">✓ right</span> : <span className="down">✗ wrong</span>}
                      <div className="muted">{e.stockAtExpiry != null ? `stock ${e.stockAtExpiry}` : ""}</div></>
                  )}
                </td>
                <td className={`small r ${e.returnPct == null ? "" : e.returnPct > 0 ? "up" : "down"}`}>{e.returnPct == null ? "—" : `${e.returnPct > 0 ? "+" : ""}${Math.round(e.returnPct * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > shown && (
        <p style={{ textAlign: "center", marginBottom: 0 }}>
          <button type="button" className="ghost" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button>
        </p>
      )}
    </section>
  );
}
