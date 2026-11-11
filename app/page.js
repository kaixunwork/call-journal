// The home page: what Starcall is, for someone arriving for the first time.
// The stock list itself is at /stocks/ (the installed app opens there).
import Link from "next/link";
import Logo from "@/components/Logo";
import "./options/welcome/welcome.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Home() {
  return (
    <div className="welcome home">
      <section className="w-hero">
        <div className="w-brand" aria-label="Starcall">
          <Logo size={56} />
          <div><span className="wordmark">Star<span>call</span></span><div className="w-sub">Make the call</div></div>
        </div>
        <h1>Make the call. Then find out if you were right.</h1>
        <p className="w-lead">
          Research any US, Hong Kong or Singapore stock, write down whether you think it&apos;s going up or down and why, and get graded
          when your check-back date comes. New to options? Learn them here, and practise with a bot that grades itself.
        </p>
        <div className="w-ctas">
          <Link className="w-btn primary" href="/stocks/">Browse stocks</Link>
          <Link className="w-btn" href="/options/">Learn options</Link>
        </div>
      </section>

      <section className="w-section">
        <h2>What you can do</h2>
        <ol className="w-steps">
          <li>
            <span className="w-num">1</span>
            <h3>Research</h3>
            <p>About 9,600 stocks: price and chart, key numbers, analyst ratings and price targets, financial statements and news. Add an Anthropic key and Claude writes a balanced take on any stock.</p>
            <p><Link href="/stocks/">Browse stocks →</Link></p>
          </li>
          <li>
            <span className="w-num">2</span>
            <h3>Make your call</h3>
            <p>Bullish or bearish, with your reasons and a check-back date. When the date comes, your call is graded at the real closing price, and your hit rate builds up over time.</p>
            <p><Link href="/calls/">My calls →</Link></p>
          </li>
          <li>
            <span className="w-num">3</span>
            <h3>Learn options</h3>
            <p>Seven short lessons, then daily option ideas that follow the rules you learned. Paper trade them, and watch a bot predict, get scored, and fix its own rules.</p>
            <p><Link href="/options/welcome/">How the options side works →</Link></p>
          </li>
        </ol>
      </section>

      <section className="w-section">
        <h2>See the options side in action</h2>
        <p className="w-video-note">75 seconds, using the real app: a lesson, an idea and why it was picked, a paper trade, the bot replacing rules that failed, and its results on real market history.</p>
        <video className="w-video" src={`${BASE}/demo/promo.mp4`} poster={`${BASE}/demo/promo-poster.jpg`} controls preload="metadata" playsInline muted width="1280" height="720" />
        <p className="w-video-note"><Link href="/options/backtest/">See the bot on 2½ years of real history →</Link></p>
      </section>

      <section className="w-section">
        <h2>Why practise first</h2>
        <ul className="w-points">
          <li><strong>It keeps you honest.</strong> A call is written down before the result, with your reasons, so you can&apos;t remember it differently later.</li>
          <li><strong>It shows its working.</strong> Every number comes with where it came from: analysts, financials, the rules an option idea passed.</li>
          <li><strong>It costs nothing.</strong> No account, no sign-up, no money. Your journal stays in your browser, and you can back it up to a file.</li>
        </ul>
      </section>

      <section className="w-section w-honest">
        <h2>The honest part</h2>
        <ul>
          <li>A practice journal for learning. Nothing here places a real order, and nothing here is investment advice.</li>
          <li>Prices come from free public sources and can be up to about 15 minutes delayed.</li>
          <li>Buying options can lose 100% of what you pay, and often does.</li>
        </ul>
      </section>

      <section className="w-final">
        <h2>Pick a stock. Make your first call.</h2>
        <div className="w-ctas" style={{ justifyContent: "center" }}>
          <Link className="w-btn primary" href="/stocks/">Browse stocks</Link>
          <Link className="w-btn" href="/options/lesson/?n=1">Start lesson 1</Link>
        </div>
      </section>
    </div>
  );
}
