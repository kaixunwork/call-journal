// The options lesson plan. Work through it in order: each lesson unlocks the next once its check is answered.
// Lesson 6 teaches the exact rules the option ideas use (lib/options.js RULES and LIMITS). Change both together.
//
// Each lesson: { id, title, minutes, sections: [{ h?, p: [paragraphs], example? }], check: [{ q, options, answer, why }] }
// Paragraphs are plain text; **bold** is supported.

export const LESSONS = [
  {
    id: "what",
    title: "What an option is",
    minutes: 5,
    sections: [
      {
        p: [
          "An **option** is a contract that gives you the right, but not the duty, to buy or sell a stock at a fixed price before a fixed date.",
          "You pay for that right up front. The amount you pay is the **premium**. If the right turns out to be worthless, you simply let it expire and lose the premium. That's the most a buyer can lose.",
        ],
      },
      {
        h: "The four words you need",
        p: [
          "**Call**: the right to *buy* the stock. You buy a call when you think the stock will go up.",
          "**Put**: the right to *sell* the stock. You buy a put when you think the stock will go down.",
          "**Strike**: the fixed price in the contract.",
          "**Expiry**: the last day the contract exists. US stock options usually expire on a Friday.",
        ],
      },
      {
        h: "One contract = 100 shares",
        p: [
          "Option prices are quoted per share, but one US contract covers **100 shares**. A premium shown as $2.50 costs $250 for one contract.",
        ],
        example: "Stock XYZ trades at $100. A call with a $105 strike, expiring in 45 days, costs $2.50. One contract costs $250. It gives you the right to buy 100 XYZ shares at $105 any time before expiry.",
      },
    ],
    check: [
      {
        q: "You think a stock will rise. Which option would you buy?",
        options: ["A call", "A put"],
        answer: 0,
        why: "A call is the right to buy at the strike. It gains value when the stock rises.",
      },
      {
        q: "An option is quoted at $1.80. What does one contract cost?",
        options: ["$1.80", "$18", "$180"],
        answer: 2,
        why: "One contract covers 100 shares: $1.80 × 100 = $180.",
      },
    ],
  },
  {
    id: "payoff",
    title: "How you make or lose money",
    minutes: 6,
    sections: [
      {
        h: "At expiry, an option is worth its intrinsic value",
        p: [
          "On expiry day a call is worth **stock price − strike** (if that's positive), and a put is worth **strike − stock price** (if that's positive). Otherwise it's worth zero.",
          "An option that would be worth something if it expired now is **in the money**. One that wouldn't is **out of the money**. When the strike is right at the stock price, it's **at the money**.",
        ],
      },
      {
        h: "Breakeven",
        p: [
          "You paid a premium, so the stock has to move past the strike by at least that much before you profit.",
          "**Call breakeven = strike + premium. Put breakeven = strike − premium.**",
        ],
        example: "You buy the XYZ $105 call for $2.50. Breakeven is $107.50.\n• XYZ ends at $115: the call is worth $10. Profit $7.50 × 100 = $750.\n• XYZ ends at $106: worth $1. Loss $1.50 × 100 = $150, even though the stock went up.\n• XYZ ends at $100: worth $0. You lose the whole $250.",
      },
      {
        h: "Why people use options",
        p: [
          "**Leverage**: $250 controls $10,000 of stock. A 15% stock move turned $250 into $1,000 above.",
          "**Limited loss**: a buyer can lose only the premium. But losing all of it is common, and it happens fast.",
        ],
      },
    ],
    check: [
      {
        q: "You buy a $50 put for $3. What is breakeven at expiry?",
        options: ["$53", "$50", "$47"],
        answer: 2,
        why: "A put profits as the stock falls. Breakeven is strike − premium: $50 − $3 = $47.",
      },
      {
        q: "You bought a call. The stock rose, but finished below your breakeven. What happened?",
        options: ["You made a profit", "You lost money", "You broke even exactly"],
        answer: 1,
        why: "Below breakeven, what the option is worth at expiry is less than the premium you paid.",
      },
    ],
  },
  {
    id: "price",
    title: "What sets an option's price",
    minutes: 6,
    sections: [
      {
        h: "Intrinsic value + time value",
        p: [
          "Before expiry, the premium is **intrinsic value** (what it's worth if exercised now) plus **time value** (what people pay for the chance it becomes worth more).",
          "Time value is highest for at-the-money options, and it shrinks to zero by expiry.",
        ],
        example: "XYZ at $100. A $95 call costs $7. Intrinsic value is $5 ($100 − $95). The other $2 is time value, and it will be gone by expiry.",
      },
      {
        h: "Three things move the premium",
        p: [
          "**The stock price.** Calls gain when it rises, puts when it falls.",
          "**Time left.** More time means more chance of a big move, so a higher premium. Every day that passes takes a little away. This is called **time decay**.",
          "**Implied volatility (IV).** How much the market expects the stock to swing, as a yearly percentage. Higher IV means pricier options. IV often jumps before earnings and drops sharply after, so a buyer can be right on direction and still lose. This is the \"IV crush\".",
        ],
      },
      {
        h: "Comparing IV with the stock's own history",
        p: [
          "You can measure how much a stock actually swung over the last 6 months: its **historical volatility**. If an option's IV is far above that, the option is priced for unusually big moves, and you're paying extra for them.",
        ],
      },
    ],
    check: [
      {
        q: "A $40 call costs $4.50 when the stock is at $42. How much is time value?",
        options: ["$2.50", "$4.50", "$2.00"],
        answer: 0,
        why: "Intrinsic value is $42 − $40 = $2. The rest, $4.50 − $2 = $2.50, is time value.",
      },
      {
        q: "If nothing else changes, what does the passing of time do to an option you bought?",
        options: ["Makes it worth more", "Makes it worth less", "Nothing"],
        answer: 1,
        why: "Time decay: the time-value part of the premium shrinks every day until expiry.",
      },
    ],
  },
  {
    id: "delta",
    title: "Delta and time decay",
    minutes: 5,
    sections: [
      {
        h: "Delta: how much the option moves with the stock",
        p: [
          "**Delta** says how much the option's price moves for each $1 the stock moves. A call with delta 0.60 rises about 60¢ when the stock rises $1.",
          "Calls run from 0 to 1. Puts run from 0 to −1 (they move the other way). This app shows put delta as a positive number to keep things simple.",
          "Delta is also a rough guess at the chance the option finishes in the money. Delta 0.60 ≈ a 60% chance.",
        ],
      },
      {
        h: "Picking a strike by delta",
        p: [
          "**Deep in the money (delta 0.8+)**: behaves almost like the stock, costs a lot, little leverage.",
          "**At the money (about 0.5)**: a coin flip, with the most time value to lose.",
          "**Far out of the money (0.2 or less)**: cheap, like a lottery ticket. Usually expires worthless.",
          "**Slightly in the money (0.55–0.70)**: a common middle ground for beginners. It tracks the stock well, much of what you pay is real value, and there's less time value to decay.",
        ],
      },
      {
        h: "Time decay speeds up",
        p: [
          "Time value fades slowly at first, then quickly in the last few weeks. That's why buyers usually choose **30 days or more** to expiry. It gives the idea time to work before decay bites hardest.",
        ],
      },
    ],
    check: [
      {
        q: "A call has delta 0.65. The stock rises $2. Roughly how much does the call's premium rise?",
        options: ["$0.65", "$1.30", "$2.00"],
        answer: 1,
        why: "About delta × the stock's move: 0.65 × $2 ≈ $1.30.",
      },
      {
        q: "Why do the rules prefer 30+ days to expiry?",
        options: ["Options are cheaper then", "Time decay is fastest in the last few weeks", "Brokers require it"],
        answer: 1,
        why: "Decay accelerates near expiry. More time means less of your premium melts away while you wait.",
      },
    ],
  },
  {
    id: "risk",
    title: "The risks brokers don't spell out",
    minutes: 6,
    sections: [
      {
        p: [
          "**You can lose 100% of what you paid, often.** Many options bought by individuals expire worthless. Only use money you can afford to lose, and keep each trade small (many people risk no more than 1–2% of their account on one).",
          "**Being right isn't enough.** The stock has to move far enough (past breakeven) and soon enough (before expiry). Right direction, too slow, is still a loss.",
          "**Liquidity.** Some contracts barely trade. The gap between the **bid** (what buyers pay) and the **ask** (what sellers want) can be wide, so you lose money the moment you buy. Stick to contracts that trade hundreds of times a day.",
          "**Earnings and IV crush.** IV usually drops sharply after an earnings report, which can wipe out a premium even when the stock moves your way.",
          "**Selling options is different.** This course covers *buying* calls and puts only. Selling (writing) options can lose far more than you take in, sometimes without limit. Brokers need extra approval before they let you do it, for good reason.",
          "**Assignment and exercise.** Most people close (sell) their option before expiry instead of exercising it. If you hold an in-the-money option to expiry, your broker may exercise it automatically, which needs cash for 100 shares.",
        ],
      },
    ],
    check: [
      {
        q: "What is the most a buyer of a call or put can lose?",
        options: ["The premium paid", "Twice the premium", "Unlimited"],
        answer: 0,
        why: "A buyer's loss is capped at the premium. Sellers are the ones exposed to large losses.",
      },
      {
        q: "A contract shows bid $1.00 and ask $1.40. What does that tell you?",
        options: ["It's a bargain", "It trades thinly; you'd lose about 30¢ a share just getting in and out", "It will expire soon"],
        answer: 1,
        why: "A wide bid–ask gap is a cost you pay up front. It's a sign the contract doesn't trade much.",
      },
    ],
  },
  {
    id: "rules",
    title: "Seven rules for picking an option",
    minutes: 8,
    sections: [
      {
        p: [
          "These are the rules this app uses to pick option ideas. Every idea names the rules it passes, so you can check them yourself. Ideas only buy calls or puts. They never sell options.",
        ],
      },
      {
        h: "Rule 1: Analysts lean your way",
        p: [
          "At least **5 analysts** cover the stock. For a **call**, the consensus is Buy or Strong buy and the average price target is **10%+ above** today's price. For a **put**, the consensus is Hold or worse and the target is **5%+ below**.",
          "Analysts are often wrong. This rule only makes sure you aren't betting against the professionals who follow the company most closely.",
        ],
      },
      {
        h: "Rule 2: Give it 30–75 days",
        p: ["Use the first expiry at least 30 days out (up to 75). It gives the idea time to work before time decay speeds up."],
      },
      {
        h: "Rule 3: Pick a strike with delta 0.55–0.70",
        p: ["Slightly in the money. The option tracks the stock and carries less time value to lose. The app aims for about 0.62."],
      },
      {
        h: "Rule 4: Only contracts that actually trade",
        p: ["At least **100 contracts** traded in the last session, and a trade in the last few days. Thinly traded contracts are hard to get out of at a fair price."],
      },
      {
        h: "Rule 5: Breakeven inside the analyst target",
        p: ["Strike + premium (calls) should be below the average analyst target, and strike − premium (puts) above it. If even the analysts' target wouldn't get you to breakeven, the odds are against you."],
      },
      {
        h: "Rule 6: Don't overpay for volatility",
        p: ["Implied volatility should be no more than **1.5×** the stock's own 6-month volatility. Higher than that and you're paying for swings the stock doesn't usually make, often ahead of earnings."],
      },
      {
        h: "Rule 7: No earnings report before expiry",
        p: ["Check the company's next earnings date. If it falls before expiry, implied volatility usually drops sharply right after the report (lesson 5's IV crush), which can sink the option even when the stock moves your way. Each idea shows the date. The bot tests whether skipping these ideas does better."],
      },
      {
        h: "Expected value, prediction and confidence",
        p: [
          "Rules 1–4 must pass for an idea to appear at all. Rules 5, 6 and 7 are shown as checks.",
          "For every idea the bot works out its **expected value (EV)**: how much it expects to make or lose per $1 of premium, on average. It starts from a model (the stock drifting toward the analyst target, swinging as much as it usually does) and, as results come in, leans more and more on how this set of rules has actually done.",
          "From that it makes a **prediction**: **Y** if EV is positive (it expects a profit), **N** if not. Confidence follows EV: **High** = EV +20% or more with a better-than-even chance of profit; **Medium** = positive EV; **Low** = zero or negative EV.",
          "A second opinion comes from **Jev**, a decision model built to return a choice with a confidence score. It sees the same facts (but not the bot's expected value) and decides Y or N with a confidence from 0 to 100%. Both are scored on the same ideas; whichever has been right more often decides the prediction and confidence you see, and the ideas page says when they disagree.",
          "These seven rules are only the bot's starting point. It treats them as a hypothesis, tests variations alongside them, and replaces them if a variation does better. Lesson 7 explains how.",
        ],
      },
    ],
    check: [
      {
        q: "A call idea has breakeven $118 and the analyst target is $112. Which rule does it fail?",
        options: ["Rule 3: delta", "Rule 5: breakeven inside the target", "Rule 2: time"],
        answer: 1,
        why: "Breakeven ($118) is beyond the target ($112), so even the analysts' target wouldn't make it pay.",
      },
      {
        q: "Which of these would the rules pick?",
        options: ["A call with delta 0.20, very cheap", "A call with delta 0.62, 45 days out, 2,000 contracts traded", "A call expiring in 5 days"],
        answer: 1,
        why: "It fits rules 2, 3 and 4. Delta 0.20 is a lottery ticket, and 5 days leaves no time.",
      },
    ],
  },
  {
    id: "paper",
    title: "Paper trading and checking yourself",
    minutes: 4,
    sections: [
      {
        p: [
          "**Paper trading** means recording a trade as if you'd made it, with no money involved. It's how you find out whether you (and the rules) are any good before risking anything.",
          "In this app you can paper trade any idea. It records the premium you'd have paid, the rules it passed and its confidence level.",
          "Until expiry, the app estimates what the option is worth from the stock's current price, using the pricing model with the volatility seen when you bought. At expiry it settles the trade exactly: what the option is worth at expiry minus the premium paid.",
          "Each paper trade also keeps the bot's prediction for it, so you can see when the bot was right and when it wasn't.",
        ],
      },
      {
        h: "How the bot checks itself",
        p: [
          "The bot paper trades too: every idea it produces is logged with its Y or N prediction **before** the result is known, and saved in the app's public history so it can't be changed later.",
          "At expiry each prediction is scored from the stock's closing price: **Y** if the option ended worth more than its premium, **N** if not. Right or wrong.",
          "A set of rules (a **hypothesis**) is judged on its Y calls once it has 20 of them. Right at least half the time: it's **reinforced** and kept. Less: it's **refuted**, and the best challenger that's doing better takes its place. Challengers are variations, each changing one setting, tracked quietly on the same stocks.",
          "Twenty or thirty settled trades is the minimum before reading much into results, for you or the bot. A handful of wins or losses is mostly luck. Options here last 30–75 days, so the first verdicts take a couple of months.",
        ],
      },
    ],
    check: [
      {
        q: "Your first 3 paper trades all made money. What can you conclude?",
        options: ["The rules work", "Not much yet: three trades is mostly luck", "You should trade real money"],
        answer: 1,
        why: "A few results can't tell skill from luck. Keep recording until you have dozens.",
      },
    ],
  },
];

export const TOTAL_MINUTES = LESSONS.reduce((s, l) => s + l.minutes, 0);
