"use client";

// The bot's track record: every prediction it logged (Y = profit, N = loss), how each one turned out,
// and every time it kept or replaced a hypothesis. ?demo=1 shows the simulation with a replay control.
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BASE, loadJson, timeAgo } from "@/lib/format";
import { describe, diff, KEEP_AT, MIN_EVIDENCE, stats } from "@/lib/learn";
import CallsTable from "@/components/CallsTable";

function Bot() {
  const demo = useSearchParams().get("demo") === "1";
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(null); // replay position (index into dates)
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const load = demo
      ? fetch(`${BASE}/demo/ledger.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("not-found"))))
      : loadJson("ledger.json");
    load.then(setData).catch((e) => setError(e.message));
  }, [demo]);

  const dates = useMemo(() => {
    if (!data) return [];
    return [...new Set([...data.events.map((e) => e.date), ...data.entries.map((e) => e.date), ...data.entries.map((e) => e.settledOn).filter(Boolean)])].sort();
  }, [data]);

  useEffect(() => { if (dates.length && day == null) setDay(demo ? 0 : dates.length - 1); }, [dates, day, demo]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setDay((d) => {
      if (d >= dates.length - 1) { setPlaying(false); return d; }
      return d + 1;
    }), 120);
    return () => clearInterval(timer.current);
  }, [playing, dates.length]);

  if (error) {
    return (
      <div className="card">
        <h1>The bot&apos;s track record</h1>
        <p className="muted">{error === "not-found" ? "No track record yet. It starts with the next daily data run." : "Couldn't load the track record. Try refreshing."}</p>
        <p><Link href="/options/bot/?demo=1">See the simulation instead →</Link></p>
      </div>
    );
  }
  if (!data || day == null) return <div className="card muted">Loading…</div>;

  const at = dates[day] || dates.at(-1);
  const view = asOf(data, at);
  const active = view.hypotheses.find((h) => h.status === "active");
  const challengers = view.hypotheses.filter((h) => h.status === "challenger");
  const retired = view.hypotheses.filter((h) => h.status === "retired");
  const yCalls = view.entries.filter((e) => e.hyp === active.id && e.predict === "Y");
  const openCount = yCalls.filter((e) => !e.outcome).length;
  // Settled first (newest result first), so you can see where it was right and wrong
  const trades = yCalls.filter((e) => e.outcome && e.outcome !== "void").sort((a, b) => b.settledOn.localeCompare(a.settledOn)).slice(0, 10);

  return (
    <>
      <p className="small" style={{ margin: "0 0 8px" }}><Link href="/options/">← Learn options</Link></p>
      <h1>The bot&apos;s track record</h1>
      {demo ? (
        <p className="notice"><strong>Simulation.</strong> {data.simulation?.note} It shows how the bot learns; it says nothing about real markets.</p>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>Updated {timeAgo(data.updatedAt)}. Every prediction is logged before its result and saved in the repository&apos;s history. <Link href="/options/bot/?demo=1">Watch the simulation</Link></p>
      )}

      <section className="card">
        <h2>How the bot judges itself</h2>
        <p className="small" style={{ margin: 0 }}>
          Each idea gets a prediction: <span className="yn Y">Y</span> if its expected value is positive (it expects a profit), <span className="yn N">N</span> if not.
          At expiry the option is valued at the stock&apos;s closing price, and the prediction is scored right or wrong.
          A hypothesis is judged on its Y calls once it has {MIN_EVIDENCE}: right at least {Math.round(KEEP_AT * 100)}% of the time and it&apos;s kept;
          less and it&apos;s refuted and replaced by the best challenger that does better.
        </p>
      </section>

      {dates.length > 1 && (
        <section className="card replay">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{demo ? "Replay" : "Look back"}: {at}</strong>
            <div className="row">
              <button type="button" className="ghost" onClick={() => { setDay(0); setPlaying(false); }}>⏮</button>
              <button type="button" onClick={() => { if (day >= dates.length - 1) setDay(0); setPlaying(!playing); }}>{playing ? "Pause" : "▶ Play"}</button>
            </div>
          </div>
          <input type="range" min={0} max={dates.length - 1} value={day} aria-label="Date"
            onChange={(e) => { setPlaying(false); setDay(+e.target.value); }} />
        </section>
      )}

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="small muted">Active hypothesis</div>
            <h2 style={{ margin: "2px 0 6px" }}>{active.id} <Verdict v={active.verdict} /></h2>
          </div>
          <HitRate s={active.stats} />
        </div>
        <p style={{ margin: "0 0 8px" }}>{describe(active.params)}</p>
        {active.parent && <p className="small muted" style={{ margin: 0 }}>Made from {active.parent} by changing: {diff(view.byId[active.parent].params, active.params)}.</p>}

        <h3 style={{ marginTop: 16 }}>Its paper trades: latest results of its profit calls</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{openCount} more still open, waiting for expiry.</p>
        {trades.length === 0 ? <p className="small muted">No results yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Settled</th><th>Option</th><th>Predicted</th><th>Result</th><th className="r">Return</th><th></th></tr></thead>
              <tbody>
                {trades.map((e, i) => (
                  <tr key={i}>
                    <td className="small">{e.settledOn}<div className="muted">logged {e.date}</div></td>
                    <td className="small"><strong>{e.symbol}</strong> {e.side} {e.strike} · exp {e.expiry}<div className="muted">EV {e.ev >= 0 ? "+" : ""}{Math.round(e.ev * 100)}% · paid {e.premium}</div></td>
                    <td><span className="yn Y">Y</span></td>
                    <td>{e.outcome ? <span className={`yn ${e.outcome}`}>{e.outcome}</span> : <span className="small muted">open</span>}</td>
                    <td className={`r small ${e.returnPct == null ? "" : e.returnPct > 0 ? "up" : "down"}`}>{e.returnPct == null ? "—" : `${e.returnPct > 0 ? "+" : ""}${Math.round(e.returnPct * 100)}%`}</td>
                    <td>{e.outcome && (e.outcome === e.predict ? <span className="up">✓</span> : <span className="down">✗</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!demo && <JevCard data={data} />}

      <section className="card">
        <h2>What the bot learned</h2>
        <ul className="events">
          {view.events.slice(0, 14).map((e, i) => (
            <li key={i} className={e.type}><span className="small muted">{e.date}</span> {e.text}</li>
          ))}
        </ul>
      </section>

      <CallsTable entries={view.entries} hypotheses={view.hypotheses.map((h) => h.id)}
        note={demo
          ? "Every paper trade the bot logged in the simulation, as of the replay date, including the variations it tests quietly."
          : "Every paper trade the bot has logged, including the variations it tests quietly. Open calls are scored when they expire."} />
      {!demo && (
        <p className="small muted">For an example with results, see <Link href="/options/backtest/">its calls on 2½ years of real history</Link>.</p>
      )}

      <section className="card table-wrap">
        <h2>Challengers, tested quietly on the same stocks</h2>
        <HypTable rows={challengers} byId={view.byId} />
        {retired.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="small"><strong>Retired ({retired.length})</strong></summary>
            <HypTable rows={retired} byId={view.byId} />
          </details>
        )}
      </section>
    </>
  );
}

// The ledger as it stood at the end of `date`: later entries hidden, later results not yet known
function asOf(data, date) {
  const entries = data.entries.filter((e) => e.date <= date).map((e) =>
    e.settledOn && e.settledOn <= date ? e : { ...e, outcome: null, returnPct: null, right: undefined });
  const ordered = entries.slice().reverse(); // oldest first, as stats() expects
  const events = data.events.filter((e) => e.date <= date);
  const ledger = { entries: ordered };
  let activeId = data.hypotheses[0].id;
  for (const e of events.slice().reverse()) if (e.type === "replaced") activeId = e.hyp;
  const hypotheses = data.hypotheses.filter((h) => h.createdOn <= date).map((h) => {
    const verdictEvent = events.find((e) => e.hyp === h.id && (e.type === "reinforced" || e.type === "refuted")) ||
      events.find((e) => e.type === "replaced" && e.text.startsWith(`${h.id} refuted`));
    const status = h.id === activeId ? "active" : h.retiredOn && h.retiredOn <= date ? "retired" : "challenger";
    let verdict = "testing";
    if (verdictEvent) verdict = verdictEvent.type === "reinforced" || (verdictEvent.type === "replaced" && verdictEvent.hyp === h.id) ? "reinforced" : "refuted";
    if (events.some((e) => e.type === "replaced" && e.hyp === h.id)) verdict = "reinforced";
    return { ...h, status, verdict, stats: stats(ledger, h.id) };
  });
  return { entries, events, hypotheses, byId: Object.fromEntries(data.hypotheses.map((h) => [h.id, h])) };
}

// Jev's record against the bot's own expected value, and whether Jev's confidence is honest
function JevCard({ data }) {
  const j = data.jev;
  if (!j || (!j.settled && !j.open)) return null;
  const pc = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <section className="card">
      <h2>Jev vs the bot&apos;s own expected value</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Jev, a decision model, predicts the same ideas independently. Whichever is right more often decides what you see
        (judged after {MIN_EVIDENCE} settled ideas). Now deciding: <strong>{data.decider === "ev" ? "the bot's expected value" : "Jev"}</strong>.
        {j.open ? ` ${j.open} of Jev's predictions are still open.` : ""}
      </p>
      {j.settled > 0 && (
        <>
          <div className="stats" style={{ marginBottom: 12 }}>
            <div className="stat"><div className="num">{pc(j.jevRight, j.settled)}</div><div className="small muted">Jev right ({j.jevRight}/{j.settled})</div></div>
            <div className="stat"><div className="num">{pc(j.evRight, j.settled)}</div><div className="small muted">Bot&apos;s EV right ({j.evRight}/{j.settled})</div></div>
          </div>
          <h3>Is Jev&apos;s confidence honest?</h3>
          <table>
            <thead><tr><th>Jev&apos;s confidence</th><th className="r">Ideas</th><th className="r">Actually right</th></tr></thead>
            <tbody>
              {j.buckets.filter((b) => b.n).map((b) => (
                <tr key={b.from}><td>{Math.round(b.from * 100)}–{Math.round(b.to * 100)}%</td><td className="r">{b.n}</td><td className="r">{pc(b.right, b.n)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginBottom: 0 }}>If the &quot;actually right&quot; column runs well below the confidence band, Jev is overconfident on options.</p>
        </>
      )}
    </section>
  );
}

function Verdict({ v }) {
  const map = { reinforced: ["up", "reinforced"], refuted: ["down", "refuted"], testing: ["muted", "testing"] };
  const [cls, text] = map[v] || map.testing;
  return <span className={`small ${cls}`} style={{ fontWeight: 600 }}>· {text}</span>;
}

function HitRate({ s }) {
  const rate = s.yHitRate;
  return (
    <div style={{ minWidth: 180, textAlign: "right" }}>
      <div className="stat"><div className={`num ${rate == null ? "" : rate >= KEEP_AT ? "up" : "down"}`}>{rate == null ? "—" : `${Math.round(rate * 100)}%`}</div></div>
      <div className="small muted">{s.yRight}/{s.yCalls} profit calls right{s.yCalls < MIN_EVIDENCE ? ` (judged at ${MIN_EVIDENCE})` : ""}</div>
      <div className="hitbar"><div style={{ width: `${(rate ?? 0) * 100}%` }} className={rate >= KEEP_AT ? "ok" : "bad"} /><span style={{ left: `${KEEP_AT * 100}%` }} /></div>
    </div>
  );
}

function HypTable({ rows, byId }) {
  if (!rows.length) return <p className="small muted">None.</p>;
  return (
    <table>
      <thead><tr><th>Hypothesis</th><th>Changes from its parent</th><th className="r">Profit calls right</th><th className="r">Avg return</th></tr></thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id}>
            <td><strong>{h.id}</strong> <Verdict v={h.verdict} /></td>
            <td className="small">{h.parent ? `${h.parent}, with ${diff(byId[h.parent].params, h.params)}` : "lesson 6 rules"}</td>
            <td className="r small">{h.stats.yCalls ? `${h.stats.yRight}/${h.stats.yCalls} (${Math.round(h.stats.yHitRate * 100)}%)` : "—"}</td>
            <td className={`r small ${h.stats.avgReturn == null ? "" : h.stats.avgReturn > 0 ? "up" : "down"}`}>{h.stats.avgReturn == null ? "—" : `${h.stats.avgReturn > 0 ? "+" : ""}${Math.round(h.stats.avgReturn * 100)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BotPage() {
  return <Suspense fallback={<div className="card muted">Loading…</div>}><Bot /></Suspense>;
}
