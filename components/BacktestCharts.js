"use client";

// Small SVG charts for the backtest page. One series each (no legend needed: the title names it),
// thin 2px lines, recessive grid, labelled reference lines, and a hover tooltip on every chart.
import { useRef, useState } from "react";

const W = 720;

function useHover() {
  const [tip, setTip] = useState(null);
  return [tip, setTip];
}

function Tip({ tip }) {
  if (!tip) return null;
  return <div className="chart-tip" style={{ left: `${tip.x * 100}%`, top: tip.top ?? 8 }}>{tip.text}</div>;
}

// Price path with horizontal reference lines (strike, breakeven, target) and vertical markers (bought, expiry)
export function PriceChart({ points, refs = [], marks = [], height = 260, money }) {
  const box = useRef(null);
  const [tip, setTip] = useHover();
  const H = height, L = 8, R = 92, T = 12, B = 26;
  const ys = [...points.map((p) => p.close), ...refs.map((r) => r.y)];
  const lo = Math.min(...ys) * 0.98, hi = Math.max(...ys) * 1.02;
  const x = (i) => L + (i / Math.max(1, points.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join("");
  const idx = (d) => points.findIndex((p) => p.date >= d);
  const onMove = (e) => {
    const r = box.current.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width * W - L) / (W - L - R) * (points.length - 1));
    const p = points[Math.max(0, Math.min(points.length - 1, i))];
    if (p) setTip({ x: x(points.indexOf(p)) / W, text: `${p.date}: ${money(p.close)}`, i: points.indexOf(p) });
  };
  return (
    <div className="chart" ref={box} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stock price over time">
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={L} x2={W - R} y1={y(r.y)} y2={y(r.y)} className={`ref ${r.kind || ""}`} />
            <text x={W - R + 6} y={y(r.y) + 4} className={`ref-label ${r.kind || ""}`}>{r.label}</text>
          </g>
        ))}
        {marks.map((m) => idx(m.date) >= 0 && (
          <g key={m.label}>
            <line x1={x(idx(m.date))} x2={x(idx(m.date))} y1={T} y2={H - B} className="mark-line" />
            <text x={x(idx(m.date))} y={H - 8} textAnchor="middle" className="axis">{m.label}</text>
          </g>
        ))}
        <path d={path} className="series" />
        {tip && <circle cx={x(tip.i)} cy={y(points[tip.i].close)} r="5" className="dot" />}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// Monthly bars: share of profit calls that were right, with a 50% reference line
export function MonthlyBars({ months, height = 220 }) {
  const box = useRef(null);
  const [tip, setTip] = useHover();
  const H = height, L = 34, R = 8, T = 10, B = 28;
  const n = months.length;
  const bw = (W - L - R) / n;
  const y = (v) => T + (1 - v) * (H - T - B);
  return (
    <div className="chart" ref={box} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of profit calls that were right, by month of expiry">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 0.5 ? "ref keep" : "grid"} />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" className="axis">{g * 100}%</text>
          </g>
        ))}
        {months.map((m, i) => {
          const rate = m.wins / m.ideas;
          const h = Math.max(2, (H - T - B) * rate);
          const bx = L + i * bw + 1;
          return (
            <g key={m.month} onMouseEnter={() => setTip({ x: (bx + bw / 2) / W, text: `${m.month} (${m.hyp}): ${m.wins} of ${m.ideas} right · avg ${Math.round(m.sumReturn / m.ideas * 100)}%` })}>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              <path d={`M${bx},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${bw - 10} q4,0 4,4 v${h - 4} z`} className={rate >= 0.5 ? "bar good" : "bar bad"} />
              {i % 3 === 0 && <text x={bx + bw / 2} y={H - 10} textAnchor="middle" className="axis">{m.month.slice(2).replace("-", "/")}</text>}
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// The active hypothesis's running hit rate, with a marker each time the bot switched
export function HitRateLine({ timeline, switches, height = 240 }) {
  const box = useRef(null);
  const [tip, setTip] = useHover();
  const pts = timeline.filter((t) => t.yHitRate != null && t.yCalls >= 10);
  const H = height, L = 34, R = 8, T = 14, B = 28;
  const x = (i) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R);
  const lo = 0.2, hi = 0.75;
  const y = (v) => T + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.yHitRate).toFixed(1)}`).join("");
  const at = (d) => pts.findIndex((p) => p.date >= d);
  const onMove = (e) => {
    const r = box.current.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width * W - L) / (W - L - R) * (pts.length - 1));
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    if (p) setTip({ x: x(pts.indexOf(p)) / W, i: pts.indexOf(p), text: `${p.date}: ${p.active} right on ${Math.round(p.yHitRate * 100)}% of its last ${p.yCalls} profit calls` });
  };
  return (
    <div className="chart" ref={box} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Active hypothesis hit rate over time">
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 0.5 ? "ref keep" : "grid"} />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" className="axis">{g * 100}%</text>
          </g>
        ))}
        {switches.map((s, k) => at(s.date) >= 0 && (
          <g key={s.date}>
            <line x1={x(at(s.date))} x2={x(at(s.date))} y1={T} y2={H - B} className="mark-line" />
            {/* alternate label heights so switches close together don't collide */}
            <text x={x(at(s.date)) + 4} y={T + 10 + (k % 2) * 14} className="axis">{s.hyp}</text>
          </g>
        ))}
        <path d={path} className="series" />
        {tip && <circle cx={x(tip.i)} cy={y(pts[tip.i].yHitRate)} r="5" className="dot" />}
        <text x={L} y={H - 8} className="axis">{pts[0]?.date.slice(0, 7)}</text>
        <text x={W - R} y={H - 8} textAnchor="end" className="axis">{pts.at(-1)?.date.slice(0, 7)}</text>
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
