# Starcall

<img src="public/icons/icon-512.png" width="96" alt="Starcall logo: a rising price line that lands on a star">

*Formerly Call Journal. The repository and web address still use `call-journal`.*

Research any US, Hong Kong or Singapore stock, write down your call (bullish or bearish, plus why), and get graded when the check-back date comes.
It's a practice journal for building trading judgement before real money is involved. It is not investment advice.

## What's in it

- **~9,600 stocks**: every actively traded company in the US (about 6,500), Hong Kong (about 2,600) and Singapore (about 530).
- **For every stock:**
  - price and day change
  - 6-month chart
  - company profile
  - key numbers (valuation, margins, growth, cash and debt)
  - analyst consensus and price targets
  - yearly and quarterly financial statements
  - news from Yahoo Finance and Google News
- **Extra for the largest companies** (top 500 US, 100 HK, 40 SG):
  - Seeking Alpha and Nasdaq news (US)
  - analyst write-ups
  - firm-by-firm rating changes, with a "Big banks" filter (US only)
- **Stocks page:**
  - ★ favourites
  - market tabs
  - quick lists: top gainers and losers, most traded, near 52-week high or low, analyst upside, high dividend, low P/E
  - filters for sector, company size and analyst rating
  - sorting, including A–Z
  - market breadth: how many stocks rose versus fell
  - a "sectors today" view
- **Claude's take:** add your Anthropic API key once, and Claude (Opus 5.5) writes a balanced analysis automatically whenever you open a stock. It costs about 2–3 US cents per stock on your API account. Each analysis is saved in your browser until the next daily data update, so reopening a stock doesn't charge again. The key stays in your browser and is sent only to Anthropic. Without a key, a button opens claude.ai with the same data filled in.
- **Installable app:**
  - On Chrome, Edge, Android or desktop: click **Install app**.
  - On iPhone or iPad: in Safari, tap Share → **Add to Home Screen**.
  - It opens full-screen with its own icon, and shows the last data you viewed when you're offline.
- **Your calls** are saved in your browser, with a scorecard of your hit rate.

## Learn options

The **Options** tab is a short course for stock investors who haven't traded options yet:

1. **Lesson plan**: 7 lessons, about 40 minutes, done in order. Each ends with a quick check, and the next lesson opens once you answer it correctly.
2. **Option ideas**: once a day, the 150 largest US stocks are checked against the six rules from lesson 6. Each idea shows which rules it passes, the analysts' view (rating, price target, recent rating changes) and a **confidence level** (high, medium or low) with its reasons. Ideas only *buy* calls or puts.
3. **Paper trades**: record an idea as if you'd bought it. Open trades are estimated from the stock's latest price; at expiry each one settles at what the option is worth at the expiry-day close. The page groups results by confidence level, to check whether high-confidence ideas really do better.

No real money is involved anywhere. Progress and paper trades are saved in your browser, like your calls. The hub page shows how long you took from the first lesson to the last, and to your first paper trade.

**Where option prices come from:** [Tradier](https://docs.tradier.com) first, Yahoo Finance as the backup (`lib/tradier.js`, `lib/yahoo.js`). Tradier keeps each contract's closing bid, ask and open interest after the US close; Yahoo zeroes them, so with Yahoo the ideas use last traded prices. The app works out implied volatility and delta itself (Black-Scholes, in `lib/options.js`) unless Tradier's live API supplies them. Each idea says which source it came from.

To turn Tradier on:

1. Open a Tradier Brokerage account and copy your **sandbox** token from web.tradier.com/user/api. Use the sandbox token, not the live one: the app only reads prices, and a live token gives full access to your brokerage account.
2. In this repository on GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name `TRADIER_TOKEN`, paste the token.
3. Start a full run (Actions → Update data and deploy → Run workflow → full). The log line "Chains: N Tradier, M Yahoo" shows which source was used.

Without the secret, or if Tradier fails, the job uses Yahoo automatically. Sandbox data is 15 minutes delayed and has no Greeks, which is fine for a run after the close. To use a live token instead, also add the repository **variable** `TRADIER_ENV` = `live`.

The lesson text is in `lib/lessons.js`. If you change a rule in `lib/options.js`, update lesson 6 to match.

## Where the data comes from

Free public sources, no sign-ups or API keys (except the optional Tradier token for option prices, see above): Yahoo Finance (screener, prices, analyst data, financials) and RSS news feeds from Yahoo Finance, Google News, Seeking Alpha and Nasdaq.

These sources are **unofficial** and meant for personal, non-commercial use. They can change or block requests without warning.

## How it works

GitHub Pages can only host static files, so the data is collected ahead of time by `.github/workflows/deploy.yml`:

- **Full run, once a day** (22:30 UTC on weekdays, about 20–30 minutes): collects everything for every stock.
- **Prices run, every 15 minutes while markets are open** (01:00–09:00 UTC for HK and SG, 13:00–22:00 UTC for the US): refreshes prices in the last full run's data. That data is kept between runs in the Actions cache.

Open pages reload prices every 5 minutes. Prices come from free sources and can be delayed up to about 15 minutes. GitHub also sometimes starts scheduled jobs late. So this is near-live, not tick-by-tick.

You can start either run by hand: in the repository's **Actions** tab, open **Update data and deploy** and click **Run workflow**.

If most stocks fail to download (for example, because a source blocks the request), the job stops and the previous version of the site stays up.

## Development

There are two versions of the app:

| | Branch | Address |
|---|---|---|
| **Live** | `main` | https://kaixunwork.github.io/call-journal/ |
| **Dev** (test site, yellow DEV badge) | `dev` | https://kaixunwork.github.io/call-journal/dev/ |

The dev site uses the live site's stock data, so it costs nothing extra to run. It keeps its own calls, favourites and filters, so testing there can't change your real journal. Your Anthropic API key is shared, so you only add it once.

**The usual flow:**

1. Switch to the dev branch:
   ```bash
   git switch dev
   ```
2. Run the app on your computer and make changes. It reloads as you save:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.
3. Push to update the dev site. It takes about 3 minutes, and you can check it on your phone too:
   ```bash
   git push
   ```
4. When you're happy, publish to the live site:
   ```bash
   git switch main
   ```
   ```bash
   git merge dev
   ```
   ```bash
   git push
   ```

**Stock data on your computer** (saved in `public/data/`, not uploaded to GitHub):

| Command | What it does | Time |
|---|---|---|
| `npm run data:quick` | 100 stocks per market, enough for testing (includes option ideas) | about 2 minutes |
| `npm run data` | All ~9,500 stocks | about 15 minutes |
| `npm run data:prices` | Refresh prices only, after a full run | about 1 minute |

Changes to the data job (`scripts/fetch-data.js`, `lib/sources.js`, `lib/yahoo.js`, `lib/universe.js`, `lib/options.js`, `lib/tradier.js`) only take effect on GitHub from `main`, because the dev site reads live data. Test them on your computer with `npm run data:quick` before merging.

## Preview the published version locally

This serves the built site under `/call-journal/`, the same way GitHub Pages does:

```bash
NEXT_PUBLIC_BASE_PATH=/call-journal npm run build
```

```bash
npm run preview
```

Then open http://localhost:4000/call-journal/.

## Code map

- `lib/universe.js`: lists every stock per market (Yahoo screener) and fetches charts in batches.
- `lib/yahoo.js`: analyst ratings, price targets, key numbers and financial statements.
- `lib/sources.js`: news from the RSS feeds.
- `lib/calls.js`: saves your calls in the browser and grades them.
- `lib/format.js`: number and currency formatting, and loading the data files.
- `components/AppShell.js`, `public/sw.js`, `public/manifest.webmanifest`: the installable app (install button, offline cache, icon).
- `scripts/fix-export.js`: a post-build fix so page switches don't do full reloads on GitHub Pages.
- `app/page.js` and `components/MarketPulse.js`: search, filters, quick lists and market breadth. `lib/favorites.js`: favourites. `components/ClaudeTake.js`: the Claude prompt. `app/stock/page.js` with `components/`: the stock page. `app/calls/page.js`: your scorecard.

## Known limits

- Prices are near-live (about every 15 minutes, may be delayed), not tick-by-tick.
- Calls, favourites, your API key and saved Claude analyses are kept in this browser only. Clearing site data or switching devices loses them.
- A call is graded on the closing price of its check-back date, which is locked in the first time you open My calls after that date.
- Anything else hosted on your `<username>.github.io` site can read data saved in this browser, including the API key. Use a key with a monthly spend limit.
- GitHub pauses scheduled jobs in repositories with no activity for 60 days. Re-enable the job from the Actions tab if that happens.
