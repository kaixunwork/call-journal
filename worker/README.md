# Starcall's small server

A free Cloudflare Worker that does two things the website can't do on its own, because GitHub Pages only hosts files:

1. **Live quotes.** It fetches stock and option prices from Tradier, keeping your Tradier token on the server, where no visitor can see it.
2. **Anonymous timings.** People who tick "share my timings" send how many minutes they took from the first lesson to finishing the lessons and to their first paper trade. That's the product's success measure. It stores only the day, the event and the minutes: no IP address, no device details, no ids, no cookies.

It only **reads** market data. It never touches any Tradier account or trading endpoint.

## Which Tradier token?

- **Sandbox token (recommended).** Quotes are 15 minutes delayed, but the token can't touch a real account. The default setting.
- **Live token.** Real-time quotes, but a live token gives **full access to your brokerage account**, including placing trades. The worker keeps it server-side and only ever calls the quotes endpoint, but if your Cloudflare account were compromised, the token would be too. Only use it if you need real-time prices, and protect your Cloudflare account with two-factor login.

## Set it up (about 15 minutes)

You need Node.js installed (the same thing you use for `npm run dev`). Run each command from the `worker` folder:

```bash
cd worker
```

1. **Create a free Cloudflare account** at dash.cloudflare.com/sign-up.

2. **Log in from your computer.** This opens a browser window to approve:
   ```bash
   npx wrangler login
   ```

3. **Create the timings database:**
   ```bash
   npx wrangler d1 create call-journal-metrics
   ```
   It prints a `database_id`. Open `wrangler.toml` and paste it in place of `PASTE-YOUR-DATABASE-ID-HERE`.

4. **Create the table:**
   ```bash
   npx wrangler d1 execute call-journal-metrics --remote --file schema.sql
   ```

5. **Add your Tradier token** (paste it when asked; it's stored encrypted at Cloudflare, never in a file):
   ```bash
   npx wrangler secret put TRADIER_TOKEN
   ```
   Using a live token? Also change `TRADIER_BASE` in `wrangler.toml` to `https://api.tradier.com/v1`.

6. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   It prints your server's address, like `https://call-journal-api.<your-name>.workers.dev`. Open it in a browser: you should see `{"ok":true,"tradier":true,"metrics":true}`.

7. **Tell the website where the server is.** On GitHub: the repository's **Settings → Secrets and variables → Actions → Variables → New repository variable**. Name: `NEXT_PUBLIC_WORKER_URL`. Value: the address from step 6 (no slash at the end). Then start a run in the **Actions** tab, or wait for the next one.

## Addresses it answers

| | |
|---|---|
| `GET /` | Which features are set up |
| `GET /quotes?symbols=AAPL,AAPL261218C00250000` | Up to 50 stock or option symbols. Cached for 15 seconds to stay inside Tradier's limits |
| `POST /metrics` | `{"event":"first_trade","minutes":34.5,"lessonsDone":7,"site":"live","v":1}`. Anything else is refused. At most 30 a minute from one address |
| `GET /metrics/summary` | Counts, median and quartiles of the timings (`?site=dev` for the test site) |

Only the website's own addresses (and `localhost` for development) can call it from a browser. Change `ALLOWED_ORIGINS` in `wrangler.toml` if the site moves.

## Test it on your computer

```bash
node test.mjs
```

Runs the server against a fake Tradier and a fake database. It needs no account and no network.
