"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LESSONS, TOTAL_MINUTES } from "@/lib/lessons";
import { allDone, doneCount, isUnlocked, loadProgress, loadTrades, resetProgress } from "@/lib/paper";

export default function OptionsHome() {
  const [progress, setProgress] = useState(null);
  const [trades, setTrades] = useState(0);

  useEffect(() => {
    setProgress(loadProgress());
    setTrades(loadTrades().length);
  }, []);

  if (!progress) return null;
  const done = doneCount(progress);
  const next = LESSONS.findIndex((l) => !progress.done[l.id]);

  return (
    <>
      <h1>Learn options</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        A short course for stock investors: {LESSONS.length} lessons, about {TOTAL_MINUTES} minutes. Then see option ideas that follow
        the rules you learned, and paper trade them. No real money, ever.
      </p>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Lesson plan</h2>
          <span className="small muted">{done}/{LESSONS.length} done</span>
        </div>
        <div className="progress" aria-hidden><div style={{ width: `${(done / LESSONS.length) * 100}%` }} /></div>
        <ol className="lessons">
          {LESSONS.map((l, i) => {
            const open = isUnlocked(progress, i);
            const finished = !!progress.done[l.id];
            return (
              <li key={l.id} className={finished ? "done" : open ? "open" : "locked"}>
                <span className="mark">{finished ? "✓" : i + 1}</span>
                {open
                  ? <Link href={`/options/lesson/?n=${i + 1}`}>{l.title}</Link>
                  : <span className="muted">{l.title}</span>}
                <span className="small muted">{finished ? "done" : open ? `${l.minutes} min` : "🔒 finish the lesson before"}</span>
              </li>
            );
          })}
        </ol>
        {next >= 0 && (
          <Link className="cta" href={`/options/lesson/?n=${next + 1}`}>{done ? "Continue" : "Start"}: {LESSONS[next].title} →</Link>
        )}
      </section>

      <section className="grid">
        <div className="card">
          <h2>Option ideas</h2>
          <p className="small muted">
            Calls and puts on large US stocks that pass the six rules from lesson 6, with the analysts&apos; view and a confidence level.
            Updated once a day.
          </p>
          {allDone(progress)
            ? <Link className="cta" href="/options/ideas/">See today&apos;s ideas →</Link>
            : <p className="small">Finish the lessons first, so you know what each rule means. <Link href="/options/ideas/">Peek anyway</Link></p>}
        </div>
        <div className="card">
          <h2>Paper trades</h2>
          <p className="small muted">Your practice trades, and whether high-confidence ideas really do better than low ones.</p>
          <Link href="/options/trades/">{trades ? `${trades} paper trade${trades === 1 ? "" : "s"} →` : "None yet →"}</Link>
        </div>
      </section>

      <Timing progress={progress} />

      {done > 0 && (
        <p className="small" style={{ textAlign: "right" }}>
          <button className="link" onClick={() => confirm("Start the lessons again? Your paper trades are kept.") && (resetProgress(), setProgress(loadProgress()))}>
            Restart lessons
          </button>
        </p>
      )}
    </>
  );
}

// How long it took to learn and pick a first option: the measure this feature is judged on
function Timing({ progress }) {
  const { startedAt, finishedAt, firstTradeAt } = progress;
  if (!startedAt) return null;
  const mins = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
  return (
    <section className="card stats">
      <div className="stat">
        <div className="num">{finishedAt ? `${mins(startedAt, finishedAt)} min` : "—"}</div>
        <div className="small muted">First lesson to last lesson</div>
      </div>
      <div className="stat">
        <div className="num">{firstTradeAt ? `${mins(startedAt, firstTradeAt)} min` : "—"}</div>
        <div className="small muted">First lesson to first paper trade</div>
      </div>
    </section>
  );
}
