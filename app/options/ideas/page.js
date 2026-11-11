"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONFIDENCE_LABEL, RULES } from "@/lib/options";
import { CONSENSUS, loadJson, money, pct, stockHref, timeAgo } from "@/lib/format";
import { addTrade, allDone, loadProgress, loadTrades } from "@/lib/paper";

export default function IdeasPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [traded, setTraded] = useState(new Set());
  const [level, setLevel] = useState("all");

  useEffect(() => {
    setProgress(loadProgress());
    setTraded(new Set(loadTrades().map((t) => t.contract)));
    loadJson("options.json").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="card">
        <h1>Option ideas</h1>
        <p className="muted">
          {error === "not-found"
            ? "No option ideas yet. They're made by the daily data run, so they'll appear after the next one."
            : "Couldn't load option ideas. Try refreshing."}
        </p>
        <Link href="/options/">Back to the lessons</Link>
      </div>
    );
  }
  if (!data || !progress) return <div className="card muted">Loading ideas…</div>;

  const counts = { high: 0, medium: 0, low: 0 };
  data.suggestions.forEach((s) => counts[s.confidence.level]++);
  const shown = data.suggestions.filter((s) => level === "all" || s.confidence.level === level);
  const ideaDate = data.updatedAt.slice(0, 10);

  return (
    <>
      <p className="small" style={{ margin: "0 0 8px" }}><Link href="/options/">← Learn options</Link></p>
      <h1>Option ideas</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        The {data.scanned} largest US stocks, checked against the <Link href="/options/lesson/?n=6">six rules</Link>.
        {" "}{data.suggestions.length} pass rules 1–4. Updated {timeAgo(data.updatedAt)}, using prices at the last close
        {data.sources && <> from {sourceText(data.sources)}</>}.
      </p>
      {!allDone(progress) && (
        <p className="notice">You haven&apos;t finished the lessons yet. The ideas will make more sense once you have. <Link href="/options/">Go to the lessons</Link></p>
      )}
      <p className="notice">For learning only, not investment advice. Ideas are bought calls and puts, which can lose 100% of what you pay. Paper trade them here; no real money is involved.</p>

      <div className="seg wrap" style={{ marginBottom: 16 }}>
        {[["all", `All ${data.suggestions.length}`], ["high", `High ${counts.high}`], ["medium", `Medium ${counts.medium}`], ["low", `Low ${counts.low}`]].map(([k, l]) => (
          <button key={k} type="button" className={level === k ? "on" : ""} onClick={() => setLevel(k)}>{l}</button>
        ))}
      </div>

      {shown.length === 0 && <div className="card muted">No ideas at this confidence level today.</div>}
      {shown.map((s) => (
        <Idea key={s.contract} s={s} traded={traded.has(s.contract)}
          onTrade={(contracts) => { addTrade({ ...s, ideaDate }, contracts); setTraded(new Set([...traded, s.contract])); }} />
      ))}

      {data.skipped?.length > 0 && (
        <details className="card">
          <summary><strong>Skipped stocks ({data.skipped.length})</strong> <span className="small muted">and the rule that ruled them out</span></summary>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {data.skipped.map((x) => (
                <tr key={x.symbol}>
                  <td><Link href={stockHref(x.symbol)}><strong>{x.symbol}</strong></Link><div className="small muted clip">{x.name}</div></td>
                  <td className="small">{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}

function Idea({ s, traded, onTrade }) {
  const [contracts, setContracts] = useState(1);
  const [err, setErr] = useState("");
  const a = s.analysts;
  const ccy = s.currency;
  const cost = s.premium * 100;
  const verb = s.side === "call" ? "rise" : "fall";

  return (
    <article className={`card idea ${s.confidence.level}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>
            <Link href={stockHref(s.symbol)}>{s.symbol}</Link>{" "}
            <span className={s.side === "call" ? "up" : "down"}>{s.side === "call" ? "▲ Buy call" : "▼ Buy put"}</span>{" "}
            {money(s.strike, 2, ccy)} · {fmtDate(s.expiry)}
          </h2>
          <div className="small muted clip">{s.name} · stock at {money(s.price, 2, ccy)}</div>
        </div>
        <span className={`conf ${s.confidence.level}`}>{CONFIDENCE_LABEL[s.confidence.level]} ({s.confidence.score}/{s.confidence.of})</span>
      </div>

      <div className="tiles" style={{ margin: "12px 0" }}>
        <Tile label="Premium" value={money(s.premium, 2, ccy)} sub={`${money(cost, 0, ccy)} per contract · ${s.priceSource === "last" ? "last trade" : `mid of ${money(s.bid, 2, ccy)}–${money(s.ask, 2, ccy)}`}`} />
        <Tile label="Breakeven" value={money(s.breakeven, 2, ccy)} sub={`stock must ${verb} ${pct(Math.abs(s.breakevenMove))}`} />
        <Tile label="Delta" value={s.delta.toFixed(2)} sub={`~${Math.round(s.delta * 100)}% chance it ends in the money`} />
        <Tile label="Days left" value={s.days} sub={`expires ${s.expiry}`} />
        <Tile label="Most you can lose" value={money(cost, 0, ccy)} sub="per contract: the whole premium" />
      </div>

      <div className="grid">
        <div>
          <h3>Rules</h3>
          <ul className="checks">
            {s.checks.map((c) => (
              <li key={c.rule} className={c.pass ? "pass" : "fail"}>
                <span className="mark">{c.pass ? "✓" : "✗"}</span>
                <div><strong>Rule {RULES[c.rule].n}: {RULES[c.rule].name}</strong><div className="small muted">{c.detail}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Analyst view</h3>
          <p style={{ margin: "0 0 6px" }}>
            <span className={`pill ${a.consensus}`}>{CONSENSUS[a.consensus] || "No rating"}</span>{" "}
            <span className="small muted">{a.count} analysts</span>
          </p>
          <p className="small" style={{ margin: "0 0 6px" }}>
            Mean target <strong>{money(a.targetMean, 2, ccy)}</strong> ({pct(a.moveToTarget, { signed: true })})
            {a.targetLow != null && a.targetHigh != null && <span className="muted">, range {money(a.targetLow, 0, ccy)}–{money(a.targetHigh, 0, ccy)}</span>}
          </p>
          <p className="small muted" style={{ margin: "0 0 6px" }}>Last 90 days: {a.upgrades} upgrade{a.upgrades === 1 ? "" : "s"}, {a.downgrades} downgrade{a.downgrades === 1 ? "" : "s"}</p>
          {a.recent?.length > 0 && (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {a.recent.map((r, i) => (
                <li key={i}>{r.date} · {r.firm}: {r.action}{r.toGrade ? ` → ${r.toGrade}` : ""}{r.target ? `, target ${money(r.target, 0, ccy)}` : ""}</li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: 12 }}>Why this confidence</h3>
          <ul className="checks compact">
            {s.confidence.reasons.map((r, i) => (
              <li key={i} className={r.ok ? "pass" : "fail"}><span className="mark">{r.ok ? "+" : "–"}</span><span className="small">{r.text}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        {traded ? (
          <span className="small up">✓ Paper traded. <Link href="/options/trades/">See your trades →</Link></span>
        ) : (
          <>
            <label htmlFor={`n-${s.contract}`} className="inline-check">Contracts</label>
            <select id={`n-${s.contract}`} value={contracts} onChange={(e) => setContracts(+e.target.value)} style={{ width: 70 }}>
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" onClick={() => { try { onTrade(contracts); setErr(""); } catch (e) { setErr(e.message); } }}>
              Paper trade · {money(cost * contracts, 0, ccy)}
            </button>
          </>
        )}
      </div>
      {err && <p className="notice small">{err}</p>}
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        Contract {s.contract} · prices from {s.dataSource || "Yahoo"}
        {s.greeksFrom === "source" ? ", volatility and delta from Tradier" : ", volatility and delta calculated by the app"}
      </p>
    </article>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="tile" style={{ cursor: "default" }}>
      <div className="small muted">{label}</div>
      <div className="tile-num">{value}</div>
      <div className="small muted">{sub}</div>
    </div>
  );
}

const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function sourceText({ Tradier = 0, Yahoo = 0 }) {
  if (!Tradier) return "Yahoo Finance";
  if (!Yahoo) return "Tradier";
  return `Tradier (${Tradier} stocks) and Yahoo Finance (${Yahoo})`;
}
