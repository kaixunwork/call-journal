"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Rich from "@/components/Rich";
import { LESSONS } from "@/lib/lessons";
import { completeLesson, isUnlocked, loadProgress, startLesson } from "@/lib/paper";

// One static page serves every lesson: /options/lesson/?n=1
function LessonFromQuery() {
  const n = parseInt(useSearchParams().get("n"), 10);
  const index = n - 1;
  const lesson = LESSONS[index];
  const [progress, setProgress] = useState(null);

  useEffect(() => { setProgress(startLesson()); }, []);

  if (!lesson) return <div className="card">No such lesson. <Link href="/options/">Back to the lesson plan</Link></div>;
  if (!progress) return null;
  if (!isUnlocked(progress, index)) {
    return (
      <div className="card">
        <h1>{lesson.title}</h1>
        <p>Lessons open in order. Finish the one before this first.</p>
        <Link href="/options/">Back to the lesson plan</Link>
      </div>
    );
  }
  return <Lesson key={lesson.id} lesson={lesson} index={index} progress={progress} onDone={() => setProgress(completeLesson(lesson.id))} />;
}

function Lesson({ lesson, index, progress, onDone }) {
  const [answers, setAnswers] = useState({});
  const finished = !!progress.done[lesson.id];
  const allRight = lesson.check.every((c, i) => answers[i] === c.answer);
  const next = LESSONS[index + 1];

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { if (allRight && !finished) onDone(); }, [allRight, finished, onDone]);

  return (
    <>
      <p className="small" style={{ margin: "0 0 8px" }}>
        <Link href="/options/">← Lesson plan</Link> · Lesson {index + 1} of {LESSONS.length} · {lesson.minutes} min
      </p>
      <h1>{lesson.title}</h1>

      <article className="card lesson">
        {lesson.sections.map((s, i) => (
          <section key={i}>
            {s.h && <h2>{s.h}</h2>}
            {s.p.map((p, j) => <p key={j}><Rich text={p} /></p>)}
            {s.example && <div className="example"><strong>Example</strong><br /><Rich text={s.example} /></div>}
          </section>
        ))}
      </article>

      <section className="card">
        <h2>Check yourself</h2>
        {lesson.check.map((c, i) => {
          const picked = answers[i];
          return (
            <div key={i} className="question">
              <p><strong>{i + 1}. {c.q}</strong></p>
              <div className="answers">
                {c.options.map((o, j) => (
                  <button key={j} type="button"
                    className={`answer ${picked === j ? (j === c.answer ? "right" : "wrong") : ""}`}
                    aria-pressed={picked === j}
                    onClick={() => setAnswers({ ...answers, [i]: j })}>
                    {o}
                  </button>
                ))}
              </div>
              {picked != null && (
                <p className={`small ${picked === c.answer ? "up" : "down"}`}>
                  {picked === c.answer ? "✓ Right. " : "✗ Not quite, try again. "}
                  {picked === c.answer && <span className="muted">{c.why}</span>}
                </p>
              )}
            </div>
          );
        })}

        {(finished || allRight) ? (
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span className="up small">✓ Lesson complete</span>
            {next
              ? <Link className="cta" href={`/options/lesson/?n=${index + 2}`}>Next: {next.title} →</Link>
              : <Link className="cta" href="/options/ideas/">All done. See option ideas →</Link>}
          </div>
        ) : (
          <p className="small muted" style={{ marginBottom: 0 }}>Answer every question correctly to finish the lesson.</p>
        )}
      </section>
    </>
  );
}

export default function LessonPage() {
  return (
    <Suspense fallback={<div className="card muted">Loading…</div>}>
      <LessonFromQuery />
    </Suspense>
  );
}
