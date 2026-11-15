# Prompt: build Starcall Options

Copy everything below the line into a new Claude Code session, ideally one with a GitHub repository attached. It rebuilds the options-learning product with its self-grading bot. Replace the bracketed parts first.

---

Build **Starcall Options**: a free web app that teaches stock investors who have never traded options, suggests option ideas that follow the rules it taught, lets them paper trade (never real money), and runs a bot that logs its own predictions before the result, scores itself at expiry, and replaces its own rules when they stop working. Work in [REPO URL, or "a new repository"].

## Who it's for and why
- Users have invested in stocks for years but find options confusing, and their brokerage doesn't explain them or their risks.
- Success measure: the time for a new user to learn options and pick a first option, from today's 1–2 hours to more than 50% faster.
- Never place real trades. No suggestion without a confidence level. Not investment advice, and say so on every page that suggests anything.

## Stack and hosting
- Next.js (app router) as a **static export** on **GitHub Pages**, with no server. Support a sub-path through `NEXT_PUBLIC_BASE_PATH`.
- A scheduled **GitHub Actions** job collects data and writes JSON into `public/data/`:
  - a full run every weekday at 22:30 UTC, after the US close;
  - a prices-only run every 15 minutes in market hours.
- User data (lesson progress, paper trades, calls) lives in the browser's localStorage. Wrap every read and write in try/catch. Offer a backup/restore file that merges by id.
- Dark "space" theme: deep navy background, glass cards, cyan/violet/magenta accents, neon green and red for up and down. Orbitron for headings, Inter for body text. Mobile first: no sideways scrolling at 390px.

## Data sources
- **Yahoo Finance (free, unofficial):** a screener for the stock list, quoteSummary for analyst data, a chart for daily closes, and options chains.
  - quoteSummary modules: financialData, recommendationTrend, upgradeDowngradeHistory, calendarEvents (for the next earnings date). These need a cookie and a "crumb".
  - Options chain: `/v7/finance/options/{ticker}?date=`.
  - After the US close, Yahoo shows zero for bid, ask, open interest and implied volatility. Use the last traded price, and calculate implied volatility and delta yourself.
- **Tradier, when the secret `TRADIER_TOKEN` is set:** the main source for options chains (`/markets/options/chains?greeks=true`), with Yahoo as the backup.
  - Use the sandbox URL by default; `TRADIER_ENV=live` switches to the live API.
  - Rate limiting comes back as HTTP 400 with "Quota Violation", not 429.
  - A list with one item can come back as a bare object; normalise it to an array.
  - Try the third-Friday monthly expiry 30–75 days out first, and only call the expirations endpoint if that comes back empty.
  - After 10 errors, switch to Yahoo for the rest of the run.
- Drop odd strikes that aren't on 50-cent steps: they're adjusted contracts.

## The lesson plan (7 lessons, about 40 minutes)
1. What an option is: call, put, strike, expiry, premium, one contract = 100 shares.
2. How you make or lose money: intrinsic value at expiry, breakeven (call: strike + premium; put: strike − premium), leverage, losing 100%.
3. What sets the price: intrinsic plus time value, implied volatility, IV crush, comparing IV with the stock's own historical volatility.
4. Delta and time decay: delta as a rough chance of finishing in the money; why delta 0.55–0.70 and 30+ days.
5. Risks brokers don't spell out: losing 100%, bid–ask spread and liquidity, earnings and IV crush, why selling options is different, assignment.
6. **Seven rules for picking an option**, exactly the rules below, plus how expected value, the prediction and confidence work.
7. Paper trading, and how the bot checks itself.

Each lesson ends with 1–2 multiple-choice questions. The next lesson unlocks only when every answer is correct. Record when the user started, finished, and made their first paper trade.

## The seven rules
1. **Analysts lean your way:** at least 5 analysts. **Call** when the consensus is Buy or Strong buy and the mean target is at least `minUpside`% (default 10) above the price. **Put** when the consensus is Hold or worse and the target is at least 5% below the price.
2. **30–75 days** to expiry: use the first such expiry.
3. **Delta in the band** (default 0.55–0.70). Pick the strike whose delta is closest to the middle of the band.
4. **It actually trades:** at least 100 contracts last session and a trade within the last 4 days. Use the mid price when bid and ask exist, otherwise the last price.
5. **Breakeven inside the analyst target**, shown as a check.
6. **Implied volatility at most `maxIvToHv` (1.5) times** the stock's own 6-month volatility, shown as a check.
7. **No earnings report before expiry**, shown as a check.

Pricing: Black-Scholes with no dividends and r = 4%. Work out implied volatility by bisection from the premium, and delta from that volatility. Use Tradier's mid_iv and delta when present. Show put delta as a positive number.

## Expected value, the prediction and confidence
- **Model EV:** the stock drifts toward the analyst target at the implied annual pace, ln(target/price), capped at ±50% a year, with the stock's 6-month volatility. Take the expected payoff at expiry under that lognormal distribution, divide by the premium, and subtract 1. Also calculate the chance of ending past breakeven.
- **Blend with the record:** EV = (1 − w)·model + w·(this hypothesis's average return over its last 60 settled ideas), where w = n/(n+20). Blend the chance of profit the same way.
- **Prediction:** **Y** if EV > 0, otherwise **N**.
- **Confidence:** high when EV ≥ +20% and the chance of profit ≥ 50%; medium when EV > 0; low otherwise.

## The self-learning bot (no AI text generation anywhere in the loop)
- **Hypotheses:** a hypothesis is one set of rule settings: minUpside, delta band, maxIvToHv, and the booleans needBreakeven, needVolatility, needMomentum and avoidEarnings. H1 is the lesson 6 rules. It runs with 5 challengers on the same stocks.
- **Logging:** each full run, every live hypothesis's ideas are logged to a ledger **before the result**: one entry per hypothesis, stock and expiry, on the first day it appears. Each entry records the option, premium, stock price, prediction, EV and confidence.
- **Settling:** at expiry, value the option at intrinsic value using the real close on expiry day. The outcome is Y if that value is more than the premium. Mark an entry void if no price is found 10 days later.
- **Judging:** judge each hypothesis on its last 60 **Y calls**, once it has at least 20.
  - Right at least 50% of the time: **reinforced**, and kept.
  - Below 50%: **refuted**. The best challenger at 50% or more takes over. With no such challenger, keep it and mark it refuted.
  - Challengers below 40% are retired.
- **New challengers:** made by changing one setting of the best hypothesis at a time, in a fixed order, with no randomness and never repeating a combination.
- **Event log:** log every decision in plain English with its numbers, for example "H1 refuted (22 of 60 right, 37%). Replaced by H8 (53%), which changes: rating momentum required: no → yes."
- **Persistence:** save the ledger to a separate `bot-ledger` branch with git commits from the workflow, which needs `contents: write`. **Never force-push**, so history can't be rewritten. Publish a public summary as `public/data/ledger.json`.

## Jev, an optional independent decision maker
- With the secret `TYPESAFE_API_KEY` set, POST to `https://api.typesafe.ai/v1/systemone` with a Bearer token and the body `{model: "jev-latest", state: <the idea's facts>, questions: {outcome: {type: "choice", instructions, criteria: {Y: "profit at expiry…", N: "loss…"}}}}`.
- Read `answers.outcome.choice`, `.confidence` and `.probabilities`.
- Never send Jev the bot's EV or prediction.
- Log Jev's call on the ledger entry and score it the same way. Whichever of Jev and the bot's EV has been right more often over the last 60 (after 20) decides the prediction and confidence shown. Log every switch.
- Show both on each idea, flag disagreements, and show a calibration table: for each confidence band, how often Jev was actually right.

## Pages
- `/`: landing page for the whole app, with the promo video.
- `/options/`: lesson plan hub, progress, timings, backup/restore, "since your last visit" alerts.
- `/options/lesson/?n=`: one lesson.
- `/options/ideas/`: each idea card shows:
  - the option, premium, breakeven, delta, days left and the most you can lose;
  - all seven rule checks with their numbers;
  - the analyst view: consensus, count, target range, recent rating changes;
  - prediction, confidence, EV and the reasons;
  - a "Paper trade" button.

  Also list skipped stocks with the rule that ruled them out.
- `/options/trades/`: the user's paper trades. Value them by Black-Scholes with the IV at entry, or the live bid when available. Settle exactly at expiry. Allow closing early. Include a table of results by confidence level.
- `/options/bot/`: the active hypothesis and its hit-rate bar, its latest settled calls, the event log, challengers and retired hypotheses, an "All its calls" table filterable by status, Y/N and hypothesis, and Jev vs EV. `?demo=1` loads a simulation with a replay slider.
- `/options/backtest/`: the real-history walk-through.
- `/options/welcome/`: the options landing page.

## Simulation and real-history backtest
- **Simulation:** 40 made-up stocks with a hidden pattern: upgraded stocks drift up, the rest drift down. Run the real engine day by day. Expected outcome: H1 is refuted and a challenger with `needMomentum` takes over. Label it as a simulation everywhere.
- **Backtest:** replay the real engine weekly over about 2.5 years for the 40 largest US stocks. Use real closes, and rebuild each firm's latest rating and target as of each date from Yahoo's dated `upgradeDowngradeHistory`, with nothing from the future. Model premiums with Black-Scholes from 20-day volatility × 1.15 and a 3% spread. Score outcomes from the real expiry-day close.
- **The backtest page has three parts:**
  1. What the bot saw and why, using one real worked example.
  2. Success or bust: that trade's chart with strike and breakeven lines, plus a bust, the totals, monthly hit-rate bars and the biggest wins and losses. Show the median as well as the average return.
  3. How it corrected itself: a hit-rate line with a mark at each switch, the event log, and honest lessons (it also chases luck).
- State plainly what's real, what's modelled, and the survivorship bias.

## Videos (Playwright and ffmpeg)
- Drive the real pages with caption overlays and title cards.
- **Promo, about 75 seconds:** a lesson quiz, an idea and why, a paper trade, the bot replacing rules, the real-history results.
- Also a simulation replay video and a backtest walk-through.
- Use `waitUntil: "load"`, not networkidle, on pages with video. Show the title card before the first page loads, and give each video a preview image.

## Optional small server (a Cloudflare Worker)
- `GET /quotes`: live Tradier quotes with the token kept server-side, read-only.
- `POST /metrics`: opt-in anonymous timings stored in D1, with no IPs or ids.
- CORS limited to the site's origin. The site reads the server's address from `NEXT_PUBLIC_WORKER_URL`.

## Quality bar
- Plain, short, honest copy. Show real numbers, including losses.
- Check every page in a browser at desktop and 390px width, with zero console errors.
- Keys only ever in GitHub secrets, never in code or the browser.
- Commit in small steps with clear messages.
