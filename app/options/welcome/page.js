import Link from "next/link";
import Logo from "@/components/Logo";
import "./welcome.css";

// Landing page for the options course, ideas and the self-grading bot: /options/welcome/
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Starcall Options: learn options, then let the bot prove itself",
  description: "Seven short lessons on options, daily option ideas that follow the rules you learned, and paper trading. A bot that logs every prediction and grades itself.",
};

export default function Welcome() {
  return (
    <div className="welcome">
      <section className="w-hero">
        <div className="w-brand" aria-label="Starcall Options">
          <Logo size={52} />
          <div><span className="wordmark">Star<span>call</span></span><div className="w-sub">Options</div></div>
        </div>
        <h1>Learn options in 40 minutes. Then practise on ideas that show their working.</h1>
        <p className="w-lead">
          For stock investors who have never traded options. Short lessons, daily ideas on large US stocks that follow the rules you
          learned, and paper trading. No real money, ever.
        </p>
        <div className="w-ctas">
          <Link className="w-btn primary" href="/options/lesson/?n=1">Start lesson 1</Link>
          <Link className="w-btn" href="/options/ideas/">See today&apos;s ideas</Link>
        </div>
      </section>

      <section className="w-section">
        <h2>How it works</h2>
        <ol className="w-steps">
          <li>
            <span className="w-num">1</span>
            <h3>Learn</h3>
            <p>Seven lessons, about six minutes each: calls and puts, breakeven, what sets the price, delta, the risks, and seven rules for picking an option. A quick check ends each one.</p>
          </li>
          <li>
            <span className="w-num">2</span>
            <h3>Get ideas</h3>
            <p>Every weekday the 150 largest US stocks are checked against the rules. Each idea names the rules it passes, shows what analysts think, and gives a confidence level.</p>
          </li>
          <li>
            <span className="w-num">3</span>
            <h3>Paper trade</h3>
            <p>Record an idea as if you bought it. At expiry it settles from the real closing price, so you see what would have happened.</p>
          </li>
        </ol>
      </section>

      <section className="w-section w-bot">
        <div className="w-bot-text">
          <h2>A bot that grades itself</h2>
          <ul className="w-points">
            <li><strong>It commits before it knows.</strong> Every idea carries a prediction: Y for profit, N for loss. It is logged the day the idea appears.</li>
            <li><strong>Two opinions, one judge.</strong> Jev, a decision model, gives each idea a Y or N with a confidence score. The bot works out its own expected value. Both are scored at expiry, and whichever has been right more often decides what you see.</li>
            <li><strong>Rules are hypotheses.</strong> The rule set you see is tested alongside variations. One that keeps being right is kept. One that is wrong too often is replaced by a challenger with a better record.</li>
            <li><strong>No text generation, no editing the past.</strong> It is arithmetic on real prices, and the full record is saved in the project&apos;s public history.</li>
          </ul>
          <Link href="/options/bot/">See the bot&apos;s record →</Link>
        </div>
        <LoopDiagram />
      </section>

      <section className="w-section">
        <h2>Watch it learn</h2>
        <p className="w-video-note">A 50-second simulation: the bot&apos;s first rules lose, it finds a better set from its own paper trades, and switches. Made-up stocks, not real results.</p>
        <video className="w-video" src={`${BASE}/demo/bot-demo.mp4`} controls preload="metadata" playsInline muted width="1280" height="720" />
        <p className="w-video-note"><Link href="/options/bot/?demo=1">Replay the simulation yourself →</Link></p>
      </section>

      <section className="w-section w-honest">
        <h2>The honest part</h2>
        <ul>
          <li>Paper trading only. Nothing here places a real order.</li>
          <li>Buying an option can lose 100% of what you pay, and often does.</li>
          <li>Each prediction takes 30 to 75 days to settle, so the bot&apos;s record builds slowly.</li>
          <li>This is a practice tool for learning. It is not investment advice.</li>
        </ul>
      </section>

      <section className="w-final">
        <h2>Start with what an option is.</h2>
        <p className="w-lead">Lesson 1 takes five minutes.</p>
        <div className="w-ctas">
          <Link className="w-btn primary" href="/options/lesson/?n=1">Start lesson 1</Link>
          <Link className="w-btn" href="/options/">See the lesson plan</Link>
        </div>
      </section>
    </div>
  );
}

// predict → expiry → score → keep or replace, drawn as a loop
function LoopDiagram() {
  const steps = [
    { x: 150, y: 40, t: "Predict", s: "Y or N, logged" },
    { x: 260, y: 150, t: "Expiry", s: "30–75 days later" },
    { x: 150, y: 260, t: "Score", s: "right or wrong" },
    { x: 40, y: 150, t: "Keep or replace", s: "the hypothesis" },
  ];
  return (
    <svg className="w-loop" viewBox="-40 -10 380 320" role="img" aria-label="The learning loop: predict, wait for expiry, score, then keep or replace the hypothesis">
      <defs>
        <marker id="w-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="w-loop-head" />
        </marker>
      </defs>
      <circle cx="150" cy="150" r="110" className="w-loop-ring" />
      {[-90, 0, 90, 180].map((a) => {
        // Clockwise arc from just after one box to just before the next
        const pt = (deg) => [150 + 110 * Math.cos((deg * Math.PI) / 180), 150 + 110 * Math.sin((deg * Math.PI) / 180)].map((n) => n.toFixed(1)).join(" ");
        return <path key={a} d={`M${pt(a + 38)} A110 110 0 0 1 ${pt(a + 52)}`} className="w-loop-arc" markerEnd="url(#w-arrow)" />;
      })}
      {steps.map((s) => (
        <g key={s.t} transform={`translate(${s.x} ${s.y})`}>
          <rect x="-62" y="-24" width="124" height="48" rx="10" className="w-loop-box" />
          <text y="-3" textAnchor="middle" className="w-loop-t">{s.t}</text>
          <text y="15" textAnchor="middle" className="w-loop-s">{s.s}</text>
        </g>
      ))}
      <text x="150" y="146" textAnchor="middle" className="w-loop-c">Every day,</text>
      <text x="150" y="164" textAnchor="middle" className="w-loop-c">for every idea</text>
    </svg>
  );
}
