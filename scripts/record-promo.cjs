// Records the promo video: the real app, used start to finish. A lesson and its quiz, an idea and why
// it was suggested, a paper trade, the bot replacing rules that failed, and its results on real history.
//
//   npm run data:quick                                  (real ideas; no Jev key, so the bot's own EV decides)
//   node scripts/simulate-bot.js && node scripts/backtest.js
//   NEXT_PUBLIC_BASE_PATH=/call-journal npm run build
//   node scripts/serve-pages.js                         (in another terminal)
//   node scripts/record-promo.cjs                       -> demo-video/promo.mp4 (needs ffmpeg)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve(process.argv[2] || "demo-video");
const B = "http://localhost:4000/call-journal";
const root = path.join(__dirname, "..");
const bt = JSON.parse(fs.readFileSync(path.join(root, "public/demo/backtest.json"), "utf8")).backtest;
const sim = JSON.parse(fs.readFileSync(path.join(root, "public/demo/ledger.json"), "utf8"));

(async () => {
  const { LESSONS } = await import(path.join(root, "lib/lessons.js"));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const css = `
    #cap { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(1000px, 92vw); z-index: 99;
      background: rgba(5,6,15,.94); color: #fff; font: 600 21px/1.4 system-ui, sans-serif; padding: 14px 20px; border-radius: 12px; text-align: center; border: 1px solid rgba(34,228,255,.35); }
    #cap small { display: block; font-weight: 400; font-size: 15px; opacity: .8; margin-top: 4px; }
    #card { position: fixed; inset: 0; z-index: 100; background: radial-gradient(ellipse at 30% 0%, rgba(124,77,255,.35), transparent 60%), #05060f; color: #fff; display: grid; place-items: center; text-align: center; font: 800 44px/1.25 system-ui, sans-serif; padding: 40px; }
    #card small { display: block; font-size: 21px; font-weight: 400; opacity: .78; margin-top: 14px; }
    #card img { width: 110px; height: 110px; margin-bottom: 18px; }
    header.topbar { position: static !important; }
    .click-ring { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #22e4ff; z-index: 98; pointer-events: none; animation: ring .6s ease-out forwards; }
    @keyframes ring { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }`;
  const prep = () => p.addStyleTag({ content: css });
  // "load", not "networkidle": pages with a video keep the network busy
  const go = async (url) => { await p.goto(B + url, { waitUntil: "load" }); await p.waitForTimeout(500); await prep(); };
  const cap = (t, s = "") => p.evaluate(([t, s]) => {
    let c = document.getElementById("cap");
    if (!c) { c = document.createElement("div"); c.id = "cap"; document.body.append(c); }
    c.innerHTML = t + (s ? `<small>${s}</small>` : "");
  }, [t, s]);
  const card = (t, s) => p.evaluate(([t, s, logo]) => {
    let c = document.getElementById("card");
    if (!c) { c = document.createElement("div"); c.id = "card"; document.body.append(c); }
    c.style.display = "grid";
    c.innerHTML = `<div><img src="${logo}" alt=""><br>${t}<small>${s}</small></div>`;
  }, [t, s, `${B}/icons/icon.svg`]);
  const hideCard = () => p.evaluate(() => { const c = document.getElementById("card"); if (c) c.style.display = "none"; });
  const scrollTo = (loc, off = 90) => loc.first().evaluate((el, off) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - off, behavior: "smooth" }), off);
  const click = async (loc) => {
    const box = await loc.boundingBox();
    if (box) await p.evaluate(([x, y]) => { const r = document.createElement("div"); r.className = "click-ring"; r.style.left = `${x}px`; r.style.top = `${y}px`; document.body.append(r); setTimeout(() => r.remove(), 700); }, [box.x + box.width / 2, box.y + box.height / 2]);
    await p.waitForTimeout(250);
    await loc.click();
  };
  const wait = (ms) => p.waitForTimeout(ms);

  // ---- Title (shown before the first page loads, so the video opens on it) ----
  await p.setContent(`<body style="margin:0;background:#05060f"></body>`);
  await prep();
  await card("Starcall Options", "Learn options. Practise with a bot that grades itself.");
  await wait(2400);
  await go("/options/welcome/");
  await cap("For stock investors who have never traded options.", "Short lessons, daily option ideas, paper trading. No real money, ever.");
  await wait(3600);

  // ---- 1. Learn ----
  await go("/options/lesson/?n=1");
  await cap("1 · Learn: seven short lessons, in plain English.", "What an option is, how you make or lose money, the risks brokers don't spell out.");
  await wait(3600);
  await scrollTo(p.getByText("Check yourself"));
  await wait(720);
  await cap("Each lesson ends with a quick check.", "Get it right and the next lesson opens.");
  const q = LESSONS[0].check;
  const first = p.locator(".question").nth(0);
  await click(first.locator(".answer").nth(1)); // a wrong answer first
  await wait(1040);
  await click(first.locator(".answer").nth(q[0].answer));
  await wait(800);
  await click(p.locator(".question").nth(1).locator(".answer").nth(q[1].answer));
  await wait(1760);

  // All lessons done (as if you'd worked through them) before looking at ideas
  await p.evaluate((ids) => {
    const now = Date.now();
    localStorage.setItem("call-journal:options-progress:v1", JSON.stringify({
      done: Object.fromEntries(ids.map((id, i) => [id, new Date(now - (ids.length - i) * 300000).toISOString()])),
      startedAt: new Date(now - 40 * 60000).toISOString(), finishedAt: new Date(now).toISOString(),
    }));
  }, LESSONS.map((l) => l.id));

  // ---- 2. Ideas ----
  await go("/options/ideas/");
  await cap("2 · Every weekday: option ideas on the largest US stocks.", "Only ideas that pass the rules you just learned.");
  await wait(3200);
  const idea = p.locator("article.idea").first();
  await scrollTo(idea, 70);
  await wait(720);
  await cap("Each one shows exactly what to buy, what it costs, and the most you can lose.");
  await wait(3600);
  await scrollTo(idea.getByText("Rules", { exact: true }), 70);
  await wait(720);
  await cap("And why: every rule checked, and what the analysts think.", "Nothing hidden. You can check its working.");
  await wait(4000);
  await scrollTo(idea, 70);
  await wait(560);
  await cap("The bot commits before it knows: Y (profit) or N (loss), with a confidence level.", "Its expected value, and an independent second opinion when Jev is switched on.");
  await wait(4400);

  // ---- 3. Paper trade ----
  const btn = idea.getByRole("button", { name: /Paper trade/ });
  await scrollTo(btn, 300);
  await wait(640);
  await cap("3 · Paper trade it in one click. No real money.");
  await click(btn);
  await wait(1440);
  await go("/options/trades/");
  await cap("Your paper trades, valued every day and settled at expiry from the real closing price.", "Close early whenever you like.");
  await wait(4000);

  // ---- 4. It learns ----
  await go("/options/bot/?demo=1");
  await scrollTo(p.getByText("Replay:"));
  await cap("4 · The bot grades itself. Here, a simulated market it knows nothing about…");
  await wait(2800);
  const dates = [...new Set([...sim.events.map((e) => e.date), ...sim.entries.map((e) => e.date), ...sim.entries.map((e) => e.settledOn).filter(Boolean)])].sort();
  const events = sim.events.slice().reverse();
  const refuted = events.find((e) => e.type === "refuted" || e.type === "replaced");
  const replaced = events.find((e) => e.type === "replaced");
  const slider = p.locator("input[type=range]");
  let at = 0;
  const step = async (to, ms) => { while (at < to) { at++; await slider.fill(String(at)); await p.waitForTimeout(ms); } };
  await step(dates.findIndex((d) => d >= refuted.date), 45);
  await cap("Its first rules keep being wrong. Below 50% right, they're refuted.", "Meanwhile, five variations are tested quietly on the same stocks.");
  await wait(3600);
  await step(dates.findIndex((d) => d >= replaced.date), 30);
  await scrollTo(p.getByText("What the bot learned"));
  await wait(640);
  await cap(`A variation does better, so it takes over: ${replaced.text.split("which changes: ")[1]?.replace(/\.$/, "")}.`, "Every change of mind is logged with the numbers behind it. Nothing is edited afterwards.");
  await wait(4800);

  // ---- 5. Real history ----
  await go("/options/backtest/");
  await scrollTo(p.getByText("Success or bust"));
  await wait(720);
  const ex = bt.examples.win;
  await cap(`5 · Tested on ${bt.universe.length} real stocks over 2½ years: real prices, real analyst calls.`,
    `${ex.symbol}, ${ex.loggedOn}: predicted Y, ended ${ex.returnPct > 0 ? "+" : ""}${Math.round(ex.returnPct * 100)}%. Success.`);
  await wait(4400);
  await scrollTo(p.getByText("Every idea the bot would have shown you"));
  await wait(720);
  const t = bt.totals;
  await cap(`And it tells you the truth about options: ${Math.round((t.wins / t.ideas) * 100)}% made money, ${Math.round((t.wipeouts / t.ideas) * 100)}% lost everything.`,
    `Average ${t.avgReturn > 0 ? "+" : ""}${Math.round(t.avgReturn * 100)}%, but the typical trade ${Math.round(t.medianReturn * 100)}%. A few big winners carry the rest.`);
  await wait(5200);

  // ---- End ----
  await card("Learn first. Practise for free.", "Starcall Options · paper trading only · not investment advice");
  await wait(3600);

  const video = p.video();
  await ctx.close();
  await browser.close();
  const raw = await video.path();
  const mp4 = path.join(OUT, "promo.mp4");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", mp4]);
  fs.unlinkSync(raw);
  console.log(`Saved ${mp4}`);
})();
