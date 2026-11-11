// Records the demo video: the bot teaching itself, seen through its own paper trades (the simulation).
//
//   node scripts/simulate-bot.js                        (makes public/demo/ledger.json)
//   NEXT_PUBLIC_BASE_PATH=/call-journal npm run build
//   node scripts/serve-pages.js                         (in another terminal)
//   node scripts/record-demo.cjs                        -> demo-video/bot-demo.mp4 (needs ffmpeg)
//
// Captions take their numbers from the simulated ledger, so they stay right if the simulation changes.

const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve(process.argv[2] || "demo-video");
const B = "http://localhost:4000/call-journal";
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/demo/ledger.json"), "utf8"));
const dates = [...new Set([...data.events.map((e) => e.date), ...data.entries.map((e) => e.date), ...data.entries.map((e) => e.settledOn).filter(Boolean)])].sort();
const idx = (d) => dates.findIndex((x) => x >= d);
const first = data.hypotheses[0].id;
const events = data.events.slice().reverse(); // the ledger lists newest first
const refuted = events.find((e) => e.type === "refuted" || e.type === "replaced");
const replaced = events.find((e) => e.type === "replaced");
if (!refuted || !replaced) throw new Error("The simulation has no refutation and replacement to show");
const pctIn = (text, n) => [...text.matchAll(/\((\d+)%\)/g)].map((m) => m[1])[n];
const winner = replaced.hyp;
const change = replaced.text.split("which changes: ")[1]?.replace(/\.$/, "");
const firstResults = data.entries.filter((e) => e.hyp === first && e.predict === "Y" && e.settledOn).map((e) => e.settledOn).sort()[9];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  await p.goto(`${B}/options/bot/?demo=1`);
  await p.waitForSelector("input[type=range]");
  await p.addStyleTag({ content: `
    #cap { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(980px, 92vw); z-index: 99;
      background: rgba(15,18,22,.92); color: #fff; font: 600 20px/1.4 system-ui, sans-serif; padding: 14px 20px; border-radius: 12px; text-align: center; }
    #cap small { display: block; font-weight: 400; font-size: 15px; opacity: .8; margin-top: 4px; }
    #card { position: fixed; inset: 0; z-index: 100; background: #0f1216; color: #fff; display: grid; place-items: center; text-align: center; font: 700 40px/1.3 system-ui, sans-serif; padding: 40px; }
    #card small { display: block; font-size: 20px; font-weight: 400; opacity: .75; margin-top: 12px; }
    #card img { width: 96px; height: 96px; margin-bottom: 20px; }
    header.topbar { position: static !important; }` });
  const cap = (t, s = "") => p.evaluate(([t, s]) => {
    let c = document.getElementById("cap");
    if (!c) { c = document.createElement("div"); c.id = "cap"; document.body.append(c); }
    c.innerHTML = t + (s ? `<small>${s}</small>` : "");
  }, [t, s]);
  const card = (t, s) => p.evaluate(([t, s, logo]) => {
    let c = document.getElementById("card");
    if (!c) { c = document.createElement("div"); c.id = "card"; document.body.append(c); }
    c.style.display = "grid";
    c.innerHTML = `<div><img src="${logo}" alt="">${"<br>"}${t}<small>${s}</small></div>`;
  }, [t, s, "/call-journal/brand/logo-mark.svg"]);
  const hideCard = () => p.evaluate(() => { document.getElementById("card").style.display = "none"; });
  const slider = p.locator("input[type=range]");
  let at = 0;
  const go = async (to, ms) => { const step = to > at ? 1 : -1; while (at !== to) { at += step; await slider.fill(String(at)); await p.waitForTimeout(ms); } };
  const show = (text) => p.getByText(text, { exact: false }).first().evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90 }));
  const wait = (ms) => p.waitForTimeout(ms);

  await card("How the bot taught itself", "A simulation of Call Journal's options bot, seen through its own paper trades");
  await wait(3500); await hideCard();

  await slider.fill("0"); await show("Replay:");
  await cap(`Day 1. The bot starts with the lesson 6 rules: hypothesis ${first}.`, "Every idea is logged with a prediction before the result: Y = profit, N = loss.");
  await wait(5000);

  await cap(`It paper trades ${first}'s ideas, predicting Y on each…`, "The options expire 30–75 days later.");
  await go(idx(firstResults), 30);
  await show("Its paper trades");
  await cap("The first options expire. Each prediction is scored from the closing price.", `Many of ${first}'s Y calls come back N: losses. ✗ = the prediction was wrong.`);
  await wait(6000);

  await show("Replay:");
  await cap(`The bot keeps count. It judges ${first} once it has 20 profit calls.`);
  await go(idx(refuted.date), 45);
  await cap(`Only ${pctIn(refuted.text, 0)}% of ${first}'s profit calls were right. ${first} is refuted.`, "Below 50%, a hypothesis has failed. The bot tests variations, each changing one setting.");
  await wait(5500);
  await show("What the bot learned");
  await cap("The challengers are tracked quietly on the same stocks.", `One of them, ${winner}, changes: ${change}.`);
  await wait(5500);

  await show("Replay:");
  await cap("Months of paper trades later…");
  await go(idx(replaced.date), 30);
  await show("What the bot learned");
  await cap(`${winner} is right on ${pctIn(replaced.text, 1)}% of its profit calls. It replaces ${first} automatically.`, "Nobody told the bot what mattered. It found it from its own results.");
  await wait(6500);

  await show("Replay:");
  await cap(`${winner} is reinforced: kept while it keeps working.`, "If it starts failing, the same test will replace it too.");
  await go(dates.length - 1, 25);
  await wait(3000);
  await show("Its paper trades");
  await cap(`${winner}'s paper trades now come back mostly Y.`, "Every prediction and every change of mind stays in the record. Nothing is edited after the fact.");
  await wait(6000);

  await card("Simulated market, made-up stocks.", "It shows how the bot learns, not how real markets behave. Not investment advice.");
  await wait(4000);
  const video = p.video();
  await ctx.close();
  await browser.close();
  const raw = await video.path();
  const mp4 = path.join(OUT, "bot-demo.mp4");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-movflags", "+faststart", mp4]);
  fs.unlinkSync(raw);
  console.log(`Saved ${mp4}`);
})();
