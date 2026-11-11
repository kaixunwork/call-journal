// Jev (TypeSafe's decision model, https://docs.typesafe.ai) as a second opinion on each option idea.
// Used only by the daily data job, so the API key stays a GitHub secret and never reaches the browser.
//
// For each idea Jev answers one "choice" question: Y (ends in profit at expiry) or N (ends in a loss).
// It returns the chosen option, a confidence from 0 to 1, and the probability of each option.
// Jev is NOT shown the bot's own expected value, so its answer is independent; both are logged before
// the result and scored the same way (lib/learn.js), and the better track record decides what you see.
//
// Needs TYPESAFE_API_KEY (from console.typesafe.ai/keys). JEV_MODEL defaults to "jev-latest".

const KEY = process.env.TYPESAFE_API_KEY || "";
const MODEL = process.env.JEV_MODEL || "jev-latest";
const URL_ = "https://api.typesafe.ai/v1/systemone";

export const hasJev = () => !!KEY;

const round = (v, d = 4) => (typeof v === "number" && isFinite(v) ? +v.toFixed(d) : null);

// The facts Jev decides on (deliberately not the bot's expected value or prediction)
export function stateFor(idea) {
  const a = idea.analysts;
  return {
    option: {
      action: `buy a ${idea.side}`, stock: `${idea.symbol} (${idea.name})`, strike: idea.strike, expiry: idea.expiry,
      days_to_expiry: idea.days, premium_per_share: idea.premium, breakeven: idea.breakeven,
      stock_move_needed_to_break_even_pct: idea.breakevenMove, delta: idea.delta,
      implied_volatility_pct: round(idea.iv * 100, 1), stock_6m_volatility_pct: idea.hv == null ? null : round(idea.hv * 100, 1),
      contracts_traded_last_session: idea.volume,
    },
    stock_price: idea.price,
    next_earnings_report: idea.nextEarnings ?? "unknown",
    analysts: {
      consensus: a.consensus, analyst_count: a.count, mean_target: a.targetMean, move_to_mean_target_pct: a.moveToTarget,
      target_low: a.targetLow, target_high: a.targetHigh, upgrades_last_90_days: a.upgrades, downgrades_last_90_days: a.downgrades,
    },
    rule_checks: Object.fromEntries(idea.checks.map((c) => [c.rule, c.pass ? "pass" : "fail"])),
  };
}

export const QUESTION = {
  type: "choice",
  instructions: "If someone buys this option today at this premium and holds it to expiry, will it end in a profit? " +
    "It ends in a profit only if, at expiry, it is worth more than the premium paid: for a call the stock must close above the breakeven, for a put below it.",
  criteria: {
    Y: "Profit: at expiry the stock is past the breakeven, so the option is worth more than the premium paid.",
    N: "Loss: at expiry the stock has not passed the breakeven, so the option is worth less than the premium paid (often nothing).",
  },
};

// Asks Jev about one idea. Returns { predict: "Y"|"N", confidence, pProfit, model } or throws.
export async function decide(idea, { fetchImpl = fetch } = {}) {
  const body = JSON.stringify({ model: MODEL, state: stateFor(idea), questions: { outcome: QUESTION } });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    let res;
    try {
      res = await fetchImpl(URL_, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) { lastError = e; continue; } // network error or timeout: retry
    if (res.status === 429 || res.status >= 500) { lastError = new Error(`Jev ${res.status}`); continue; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail ?? json).slice(0, 200);
      throw new Error(res.status === 401 || res.status === 403 ? `Jev refused the API key (${res.status})` : `Jev ${res.status}: ${detail}`);
    }
    const answer = json.answers?.outcome;
    if (answer?.type !== "choice" || !["Y", "N"].includes(answer.choice) || typeof answer.confidence !== "number") {
      throw new Error("Jev gave an answer in an unexpected shape");
    }
    return {
      predict: answer.choice,
      confidence: round(answer.confidence),
      pProfit: round(answer.probabilities?.Y),
      model: json.model || MODEL,
    };
  }
  throw lastError;
}

// Confidence level shown in the app for a Jev decision. A loss call (N) is always low: it isn't a buy.
export function jevLevel(j) {
  if (j.predict === "N") return "low";
  return j.confidence >= 0.75 ? "high" : "medium";
}
