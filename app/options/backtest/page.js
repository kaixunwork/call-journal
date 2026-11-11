"use client";

// A real-world walk-through of the bot: real stocks, real prices, real analyst calls, the real engine.
// Data: public/demo/backtest.json, made by scripts/backtest.js.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BASE, CONSENSUS, money as fmtMoney } from "@/lib/format";
import { CONFIDENCE_LABEL, RULES } from "@/lib/options";
import { describe } from "@/lib/learn";
import { HitRateLine, MonthlyBars, PriceChart } from "@/components/BacktestCharts";
import CallsTable from "@/components/CallsTable";

const pct = (x, signed = true) => (x == null ? "—" : `${signed && x > 0 ? "+" : ""}${Math.round(x * 100)}%`);
const money = (n) => fmtMoney(n, 2, "USD");

export default function Backtest() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`${BASE}/demo/backtest.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true));
  }, []);
  if (err) return <div className="card">The backtest hasn&apos;t been generated. Run <code>node scripts/backtest.js</code>.</div>;
  if (!d) return <div className="card muted">Loading the backtest…</div>;

  const b = d.backtest;
  const ex = b.examples.win;
  const bust = b.examples.bust;
  const events = d.events.slice().reverse().filter((e) => ["replaced", "refuted", "reinforced"].includes(e.type));
  const switches = events.filter((e) => e.type === "replaced").map((e) => ({ date: e.date, hyp: e.hyp }));
  const active = d.hypotheses.find((h) => h.status === "active");
  const first = d.hypotheses[0];

  return (
    <div className="backtest">
      <p className="small" style={{ margin: "0 0 8px" }}><Link href="/options/">← Learn options</Link></p>
      <h1>How the bot works, on real history</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        The bot&apos;s real engine, replayed week by week from {b.from} to {b.to} on {b.universe.length} of the largest US stocks.
        Three parts: what it based each idea on, whether the trades worked, and how it changed its own rules.
      </p>

      <video className="bt-video" src={`${BASE}/demo/backtest-demo.mp4`} controls preload="metadata" playsInline muted width="1280" height="720" />
      <p className="small muted" style={{ margin: "4px 0 16px" }}>The 90-second walk-through, or read on for all of it.</p>

      <section className="card honesty">
        <div className="grid3">
          <div><h3>Real</h3><ul>{b.real.map((t) => <li key={t}>{t}</li>)}</ul></div>
          <div><h3>Modelled</h3><ul>{b.modelled.map((t) => <li key={t}>{t}</li>)}</ul></div>
          <div><h3>Watch out for</h3><ul>{b.biases.map((t) => <li key={t}>{t}</li>)}</ul></div>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>A backtest for learning how the bot thinks. Past results don&apos;t predict future ones, and this is not investment advice.</p>
      </section>

      {/* ---------------- Part 1 ---------------- */}
      <h2 className="part"><span>1</span> What the bot saw, and why it suggested this</h2>
      <section className="card">
        <p style={{ marginTop: 0 }}>
          <strong>{ex.loggedOn}.</strong> {ex.name} ({ex.symbol}) closed at <strong>{money(ex.price)}</strong>. Here is everything the bot knew that day,
          and nothing from after it.
        </p>
        <h3>The last 90 days of {ex.symbol}</h3>
        <PriceChart points={ex.chartBefore} money={money}
          refs={[{ y: ex.analysts.targetMean, label: `target ${money(ex.analysts.targetMean)}`, kind: "target" }]} />

        <div className="grid" style={{ marginTop: 16 }}>
          <div>
            <h3>What analysts thought that day</h3>
            <p style={{ margin: "0 0 6px" }}>
              <span className={`pill ${ex.analysts.consensus}`}>{CONSENSUS[ex.analysts.consensus]}</span>{" "}
              <span className="small muted">{ex.analysts.count} firms with a rating in the past year</span>
            </p>
            <p className="small" style={{ margin: "0 0 6px" }}>
              Average price target <strong>{money(ex.analysts.targetMean)}</strong>, {pct(ex.analysts.moveToTarget / 100)} above the price
              (range {money(ex.analysts.targetLow)}–{money(ex.analysts.targetHigh)}).
            </p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {ex.analysts.recent.map((r, i) => <li key={i}>{r.date} · {r.firm}: {r.action}{r.toGrade ? ` → ${r.toGrade}` : ""}{r.target ? `, target ${money(r.target)}` : ""}</li>)}
            </ul>
          </div>
          <div>
            <h3>So the rules picked</h3>
            <p className="pick">Buy the <strong>{money(ex.strike)} call</strong> expiring <strong>{ex.expiry}</strong></p>
            <p className="small" style={{ margin: "0 0 4px" }}>
              Premium <strong>{money(ex.premium)}</strong> a share ({fmtMoney(ex.premium * 100, 0, "USD")} a contract, the most you can lose).
              It breaks even at <strong>{money(ex.breakeven)}</strong>: the stock has to rise {pct(ex.breakevenMove / 100)} in {ex.days} days.
            </p>
          </div>
        </div>

        <h3 style={{ marginTop: 16 }}>Why: the seven rules, checked</h3>
        <ul className="checks">
          {ex.checks.map((c) => (
            <li key={c.rule} className={c.pass ? "pass" : "fail"}>
              <span className="mark">{c.pass ? "✓" : "✗"}</span>
              <div><strong>Rule {RULES[c.rule].n}: {RULES[c.rule].name}</strong><div className="small muted">{c.detail}</div></div>
            </li>
          ))}
        </ul>

        <h3 style={{ marginTop: 16 }}>Its prediction, logged before the result</h3>
        <div className="verdict-row">
          <span className={`predict ${ex.predict}`}>Predicts {ex.predict === "Y" ? "Y · profit" : "N · loss"}</span>
          <span className={`conf ${ex.confidence.level}`}>{CONFIDENCE_LABEL[ex.confidence.level]}</span>
        </div>
        <ul className="checks compact" style={{ marginTop: 8 }}>
          {ex.confidence.reasons.map((r, i) => <li key={i} className={r.ok ? "pass" : "fail"}><span className="mark">{r.ok ? "+" : "–"}</span><span className="small">{r.text}</span></li>)}
        </ul>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Notice the bot expected a profit on average (+{Math.round(ex.ev.value * 100)}%) but gave it only a {Math.round(ex.ev.winChance * 100)}% chance of
          making money. Both can be true: most of the time an option like this loses a little or all of its premium, and occasionally it pays
          many times over.
        </p>
      </section>

      {/* ---------------- Part 2 ---------------- */}
      <h2 className="part"><span>2</span> Success or bust: what actually happened</h2>
      <section className="card">
        <Outcome ex={ex} />
      </section>
      {bust && (
        <section className="card">
          <p className="small muted" style={{ marginTop: 0 }}>And a bust, from the same rules a week earlier:</p>
          <Outcome ex={bust} />
        </section>
      )}

      <section className="card">
        <h3>Every idea the bot would have shown you</h3>
        <div className="stats">
          <Stat value={b.totals.ideas} label="Profit calls that have expired" />
          <Stat value={`${Math.round((b.totals.wins / b.totals.ideas) * 100)}%`} label={`Made money (${b.totals.wins})`} cls={b.totals.wins / b.totals.ideas >= 0.5 ? "up" : "down"} />
          <Stat value={pct(b.totals.avgReturn)} label="Average return" cls={b.totals.avgReturn >= 0 ? "up" : "down"} />
          <Stat value={pct(b.totals.medianReturn)} label="Typical (median) return" cls={b.totals.medianReturn >= 0 ? "up" : "down"} />
        </div>
        <p className="small" style={{ margin: "12px 0" }}>
          <strong>The lesson of buying options in one line:</strong> the average was {pct(b.totals.avgReturn)}, but the typical trade returned {pct(b.totals.medianReturn)} and
          {" "}{b.totals.wipeouts} of {b.totals.ideas} ({Math.round((b.totals.wipeouts / b.totals.ideas) * 100)}%) lost everything. A few big winners carry the rest.
        </p>
        <h3>Share of profit calls that came true, by month of expiry</h3>
        <MonthlyBars months={b.monthly} />
        <p className="small muted" style={{ margin: "4px 0 0" }}>Green: at least half came true. Red: fewer than half. The dashed line is 50%, the bar a hypothesis must clear. Hover a bar for details.</p>
        <div className="grid" style={{ marginTop: 12 }}>
          <Extremes title="Biggest wins" rows={b.best} />
          <Extremes title="Biggest busts" rows={b.worst} />
        </div>
      </section>

      {b.calls && (
        <CallsTable entries={b.calls} title="Every call it made, on real history"
          note="The calls of whichever rule set was in charge at the time: what you'd have seen on the ideas page each week. Real stocks, dates and outcomes; premiums modelled." />
      )}

      {/* ---------------- Part 3 ---------------- */}
      <h2 className="part"><span>3</span> How it corrected and improved itself</h2>
      <section className="card">
        <p style={{ marginTop: 0 }}>
          The bot started with the lesson 6 rules as hypothesis <strong>{first.id}</strong>: <em>{b.statement}</em> Five variations ran quietly beside it.
          Every few weeks it checked its last profit calls. Below 50% right meant refuted and replaced by a challenger that was doing better.
        </p>
        <h3>The active hypothesis&apos;s hit rate over time (lines mark each switch)</h3>
        <HitRateLine timeline={b.timeline} switches={switches} />
        <h3 style={{ marginTop: 16 }}>Every time it changed its mind</h3>
        <ul className="events">
          {events.map((e, i) => <li key={i} className={e.type}><span className="small muted">{e.date}</span> {e.text}</li>)}
        </ul>
        <p style={{ marginBottom: 0 }}>
          Where it ended up: <strong>{active.id}</strong>, {active.verdict}. <em>{describe(active.params)}</em>
        </p>
      </section>

      <section className="card lessons-learned">
        <h3>What this real run teaches about the bot itself</h3>
        <ul>
          <li><strong>It did correct itself:</strong> each time its rules fell below 50% it switched, and it ended on rules that were holding up.</li>
          <li><strong>But it also chased luck.</strong> Several challengers were promoted after a hot streak (50–64% right) and then fell back to 40–48%. With 20–60 trades,
            a challenger that looks best is often just lucky; real markets have far more noise than the simulation.</li>
          <li><strong>&quot;Right more often&quot; isn&apos;t &quot;makes more money&quot;.</strong> Some rule sets were right only a third of the time yet averaged positive returns, because
            their few winners were large. The bot currently judges on how often it&apos;s right, as you asked; returns are shown alongside.</li>
          <li><strong>Fixes worth making next:</strong> only switch when a challenger is better by more than luck would explain, and judge on more trades before switching.</li>
        </ul>
        <p className="small" style={{ marginBottom: 0 }}><Link href="/options/bot/">See the live track record →</Link> · <Link href="/options/bot/?demo=1">See the made-up simulation →</Link></p>
      </section>
    </div>
  );
}

function Outcome({ ex }) {
  const won = ex.outcome === "Y";
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0 }}>{ex.symbol} {money(ex.strike)} {ex.side}, bought {ex.loggedOn} for {money(ex.premium)}</h3>
          <div className="small muted">Predicted {ex.predict === "Y" ? "Y (profit)" : "N (loss)"} · {CONFIDENCE_LABEL[ex.confidence.level]}</div>
        </div>
        <div className={`result ${won ? "good" : "bad"}`}>
          <div className="big">{won ? "✓ Success" : "✗ Bust"}</div>
          <div className="small">{pct(ex.returnPct)} · {fmtMoney((ex.value - ex.premium) * 100, 0, "USD", false)} a contract</div>
        </div>
      </div>
      <PriceChart points={ex.path} money={money}
        refs={[
          { y: ex.strike, label: `strike ${money(ex.strike)}`, kind: "strike" },
          { y: ex.breakeven, label: `breakeven ${money(ex.breakeven)}`, kind: "be" },
        ]}
        marks={[{ date: ex.loggedOn, label: "bought" }, { date: ex.path.at(-1).date, label: "expiry" }]} />
      <p className="small" style={{ marginBottom: 0 }}>
        On {ex.expiry} {ex.symbol} closed at <strong>{money(ex.stockAtExpiry)}</strong>{" "}
        {ex.side === "call" ? (ex.stockAtExpiry > ex.strike ? "above" : "below") : (ex.stockAtExpiry < ex.strike ? "below" : "above")} the {money(ex.strike)} strike,
        so the option was worth <strong>{money(ex.value)}</strong> against {money(ex.premium)} paid.
        {" "}The prediction ({ex.predict}) was <strong className={ex.predict === ex.outcome ? "up" : "down"}>{ex.predict === ex.outcome ? "right" : "wrong"}</strong>, and that result counted toward judging the rules.
      </p>
    </>
  );
}

function Stat({ value, label, cls = "" }) {
  return <div className="stat"><div className={`num ${cls}`}>{value}</div><div className="small muted">{label}</div></div>;
}

function Extremes({ title, rows }) {
  return (
    <div>
      <h3>{title}</h3>
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="small"><strong>{r.symbol}</strong> {r.side} {r.strike}<div className="muted">{r.date} → {r.expiry}</div></td>
              <td className="small r">{money(r.stockAtEntry)} → {money(r.stockAtExpiry)}</td>
              <td className={`small r ${r.returnPct > 0 ? "up" : "down"}`}>{pct(r.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
