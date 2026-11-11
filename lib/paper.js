// Options learning progress and paper trades. Like your calls, they live in this browser only.

import { STORE } from "./format";
import { LESSONS } from "./lessons";
import { estimateValue, intrinsic } from "./options";

const PROGRESS = `${STORE}options-progress:v1`;
const TRADES = `${STORE}paper-trades:v1`;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// ---- Lesson progress ----
// { done: { [lessonId]: ISO date }, startedAt, finishedAt, firstTradeAt }
// The timestamps measure the brief's success metric: time from first lesson to first option picked.

export function loadProgress() {
  return read(PROGRESS, { done: {} });
}

export function startLesson() {
  const p = loadProgress();
  if (!p.startedAt) { p.startedAt = new Date().toISOString(); write(PROGRESS, p); }
  return p;
}

export function completeLesson(id) {
  const p = loadProgress();
  p.startedAt ??= new Date().toISOString();
  p.done[id] ??= new Date().toISOString();
  if (!p.finishedAt && LESSONS.every((l) => p.done[l.id])) p.finishedAt = new Date().toISOString();
  write(PROGRESS, p);
  return p;
}

export function resetProgress() {
  write(PROGRESS, { done: {} });
}

// A lesson is open once every lesson before it is done
export const isUnlocked = (p, index) => LESSONS.slice(0, index).every((l) => p.done[l.id]);
export const doneCount = (p) => LESSONS.filter((l) => p.done[l.id]).length;
export const allDone = (p) => doneCount(p) === LESSONS.length;

// ---- Paper trades ----

export function loadTrades() {
  return read(TRADES, []);
}

// Saves a paper trade copied from an idea. Throws if the browser won't save it.
export function addTrade(idea, contracts = 1) {
  const trade = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    symbol: idea.symbol,
    name: idea.name,
    currency: idea.currency,
    side: idea.side,
    contract: idea.contract,
    strike: idea.strike,
    expiry: idea.expiry,
    premium: idea.premium,
    iv: idea.iv,
    delta: idea.delta,
    breakeven: idea.breakeven,
    stockAtEntry: idea.price,
    target: idea.analysts.targetMean,
    contracts,
    confidence: idea.confidence.level,
    rulesPassed: idea.checks.filter((c) => c.pass).map((c) => c.rule),
    rulesFailed: idea.checks.filter((c) => !c.pass).map((c) => c.rule),
    ideaDate: idea.ideaDate,
  };
  const trades = [trade, ...loadTrades()];
  if (!write(TRADES, trades)) throw new Error("Your browser couldn't save this paper trade (storage full or blocked).");
  const p = loadProgress();
  if (!p.firstTradeAt) { p.firstTradeAt = trade.createdAt; write(PROGRESS, p); }
  return trades;
}

export function deleteTrade(id) {
  const trades = loadTrades().filter((t) => t.id !== id);
  write(TRADES, trades);
  return trades;
}

// At expiry, lock in the stock's close on expiry day and the option's final value, so the result never changes.
// history: the stock's daily closes [{date, close}]; closedThrough: last date with a final close.
export function settleTrade(id, history, closedThrough) {
  const trades = loadTrades();
  const t = trades.find((x) => x.id === id);
  if (!t || t.settledAt || !history?.length) return null;
  const point = history.find((p) => p.date >= t.expiry && (!closedThrough || p.date <= closedThrough));
  if (!point) return null;
  t.stockAtExpiry = point.close;
  t.expiryClose = point.date;
  t.finalValue = intrinsic(t.side, point.close, t.strike);
  t.settledAt = new Date().toISOString();
  write(TRADES, trades);
  return trades;
}

// Result of one trade: value per share now (estimated) or at expiry (exact), and profit/loss
export function tradeResult(t, stockPrice, now = Date.now()) {
  const value = t.settledAt ? t.finalValue : estimateValue(t, stockPrice, now);
  if (value == null) return { value: null, pnl: null, pnlPct: null, settled: false };
  const pnl = (value - t.premium) * 100 * t.contracts;
  return { value, pnl, pnlPct: ((value - t.premium) / t.premium) * 100, settled: !!t.settledAt };
}

export const isExpired = (t, today = new Date().toISOString().slice(0, 10)) => t.expiry < today;
