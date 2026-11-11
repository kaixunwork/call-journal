// Records a narrated walk-through of /options/backtest/ (the bot on real market history).
//   node scripts/backtest.js
//   NEXT_PUBLIC_BASE_PATH=/call-journal npm run build
//   node scripts/serve-pages.js                 (in another terminal)
//   node scripts/record-backtest.cjs            -> demo-video/backtest-demo.mp4 (needs ffmpeg)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve(process.argv[2] || "demo-video");
const b = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/demo/backtest.json"), "utf8")).backtest;
const ex = b.examples.win;
const bust = b.examples.bust;
const pct = (x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const usd = (n) => `$${n.toFixed(2)}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:4000/call-journal/options/backtest/");
  await p.waitForSelector(".chart svg");
  await p.addStyleTag({ content: `
    #cap { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(1000px, 92vw); z-index: 99;
      background: rgba(5,6,15,.94); color: #fff; font: 600 20px/1.4 system-ui, sans-serif; padding: 14px 20px; border-radius: 12px; text-align: center; border: 1px solid rgba(34,228,255,.35); }
    #cap small { display: block; font-weight: 400; font-size: 15px; opacity: .8; margin-top: 4px; }
    #card { position: fixed; inset: 0; z-index: 100; background: #05060f; color: #fff; display: grid; place-items: center; text-align: center; font: 700 38px/1.3 system-ui, sans-serif; padding: 40px; }
    #card small { display: block; font-size: 20px; font-weight: 400; opacity: .75; margin-top: 12px; }
    #card img { width: 96px; height: 96px; margin-bottom: 18px; }
    header.topbar { position: static !important; }` });
  const cap = (t, s = "") => p.evaluate(([t, s]) => {
    let c = document.getElementById("cap");
    if (!c) { c = document.createElement("div"); c.id = "cap"; document.body.append(c); }
    c.innerHTML = t + (s ? `<small>${s}</small>` : "");
  }, [t, s]);
  const card = (t, s) => p.evaluate(([t, s]) => {
    let c = document.getElementById("card");
    if (!c) { c = document.createElement("div"); c.id = "card"; document.body.append(c); }
    c.style.display = "grid";
    c.innerHTML = `<div><img src="/call-journal/icons/icon.svg" alt=""><br>${t}<small>${s}</small></div>`;
  }, [t, s]);
  const hideCard = () => p.evaluate(() => { document.getElementById("card").style.display = "none"; });
  const show = (text, off = 90) => p.getByText(text, { exact: false }).first()
    .evaluate((el, off) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - off, behavior: "smooth" }), off);
  const wait = (ms) => p.waitForTimeout(ms);

  await card("The options bot, on real history", `${b.universe.length} of the largest US stocks · ${b.from} to ${b.to} · real prices and analyst calls, modelled option premiums`);
  await wait(4500); await hideCard();

  await show("What the bot saw"); await wait(800);
  await cap(`Part 1. ${ex.loggedOn}: ${ex.name} closes at ${usd(ex.price)}.`, "The bot sees only what was known that day: the price history and every analyst's rating and target.");
  await wait(5500);
  await show("What analysts thought that day", 260);
  await cap(`${ex.analysts.count} analysts, mostly Buy, average target ${usd(ex.analysts.targetMean)}: ${pct(ex.analysts.moveToTarget / 100)} above the price.`,
    `So the rules pick the ${usd(ex.strike)} call expiring ${ex.expiry}, for ${usd(ex.premium)} a share.`);
  await wait(6000);
  await show("Why: the seven rules");
  await cap("Why this option: it passes all seven rules.", "Analysts lean bullish, 30–75 days left, delta in range, breakeven inside the target, volatility not stretched.");
  await wait(5500);
  await show("Its prediction, logged before");
  await cap(`It logs its prediction before the result: Y (profit). Expected value ${pct(ex.ev.value)}.`,
    `But only a ${Math.round(ex.ev.winChance * 100)}% chance of profit: options often lose, and sometimes pay many times over.`);
  await wait(6000);

  await show("Success or bust"); await wait(800);
  await cap(`Part 2. On ${ex.expiry} ${ex.symbol} closed at ${usd(ex.stockAtExpiry)}, above the strike.`,
    `The option was worth ${usd(ex.value)} against ${usd(ex.premium)} paid: ${pct(ex.returnPct)}. Success, prediction right.`);
  await wait(6500);
  await show("And a bust");
  await cap(`A bust: ${bust.symbol} closed at ${usd(bust.stockAtExpiry)}, below its ${usd(bust.strike)} strike.`,
    "The option expired worthless: −100%. The prediction was wrong, and that counts against the rules.");
  await wait(6000);
  await show("Every idea the bot would have shown you");
  await cap(`Across ${b.totals.ideas} expired ideas: ${Math.round((b.totals.wins / b.totals.ideas) * 100)}% made money. Average ${pct(b.totals.avgReturn)}, but the typical trade ${pct(b.totals.medianReturn)}.`,
    `${b.totals.wipeouts} lost everything. A few big winners carry the rest: that's buying options.`);
  await wait(7000);
  await show("Share of profit calls that came true");
  await cap("Month by month: green when at least half its profit calls came true, red when not.", "Real markets swing. The spring 2025 sell-off was almost a clean sweep of losses.");
  await wait(6000);

  await show("How it corrected and improved itself"); await wait(800);
  await cap("Part 3. Every few weeks the bot grades its own profit calls.", "Below 50% right, the rules are refuted and the best challenger takes over. Each line is a switch.");
  await wait(6500);
  await show("Every time it changed its mind");
  await cap("Every change of mind is written down, with the numbers behind it.", "It started with the lesson 6 rules, and ended on a version that was holding up.");
  await wait(6500);
  await show("What this real run teaches");
  await cap("The honest part: it also chased luck.", "Some challengers won a hot streak, took over, then slipped back. The next fix: only switch when the gap is bigger than luck.");
  await wait(7000);

  await card("Real prices. Real analyst calls. Real results.", "Option premiums are modelled. Past results don't predict future ones. Not investment advice.");
  await wait(4500);
  const video = p.video();
  await ctx.close();
  await browser.close();
  const raw = await video.path();
  const mp4 = path.join(OUT, "backtest-demo.mp4");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", mp4]);
  fs.unlinkSync(raw);
  console.log(`Saved ${mp4}`);
})();
