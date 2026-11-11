"use client";

// "Since your last visit": paper trades that settled or expired, and changes the bot made to its hypothesis.
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadJson, STORE } from "@/lib/format";
import { isExpired, loadTrades, tradeResult } from "@/lib/paper";

const SEEN = `${STORE}options-seen:v1`;
const getSeen = () => { try { return localStorage.getItem(SEEN); } catch { return null; } };
const setSeen = (v) => { try { localStorage.setItem(SEEN, v); } catch {} };

export default function WhatsNew() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const seen = getSeen();
    const now = new Date().toISOString();
    if (!seen) { setSeen(now); return; } // first visit: nothing is "new" yet
    const trades = loadTrades();
    const out = [];
    const settled = trades.filter((t) => t.settledAt && t.settledAt > seen);
    if (settled.length) {
      const won = settled.filter((t) => tradeResult(t).pnl > 0).length;
      out.push({ key: "settled", text: `${settled.length} paper trade${settled.length === 1 ? "" : "s"} settled: ${won} made money, ${settled.length - won} lost.`, href: "/options/trades/" });
    }
    const expired = trades.filter((t) => !t.settledAt && isExpired(t));
    if (expired.length) out.push({ key: "expired", text: `${expired.length} paper trade${expired.length === 1 ? " has" : "s have"} expired. Open your paper trades to see the result.`, href: "/options/trades/" });
    setItems(out);
    loadJson("ledger.json").then((l) => {
      const day = seen.slice(0, 10);
      const changes = (l.events || []).filter((e) => e.date > day && ["replaced", "refuted", "reinforced"].includes(e.type));
      if (changes.length) setItems((cur) => [...cur, ...changes.slice(0, 3).map((e, i) => ({ key: `bot${i}`, text: `The bot: ${e.text}`, href: "/options/bot/" }))]);
    }).catch(() => {});
  }, []);

  if (!items.length) return null;
  return (
    <section className="card whatsnew" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Since your last visit</h2>
        <button type="button" className="link" onClick={() => { setSeen(new Date().toISOString()); setItems([]); }}>Mark as seen</button>
      </div>
      <ul>
        {items.map((it) => <li key={it.key}><Link href={it.href}>{it.text}</Link></li>)}
      </ul>
    </section>
  );
}
