// Talks to Starcall's small server (worker/), if one is set up:
//   live quotes from Tradier, and anonymous opt-in timings for the success measure.
// Every function fails quietly (returns null or does nothing), so the app works without the server.

import { APP_ENV, STORE } from "./format";

export const WORKER = (process.env.NEXT_PUBLIC_WORKER_URL || "").replace(/\/$/, "");
export const hasWorker = () => !!WORKER;

const OPT_IN = `${STORE}metrics-optin:v1`;

async function call(path, options = {}) {
  if (!WORKER) return null;
  try {
    const res = await fetch(`${WORKER}${path}`, { ...options, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// { SYMBOL: { last, bid, ask, change, changePct, volume, openInterest?, time } }. asOf and delayed are on
// the map's non-enumerable `meta` property. null when there's no server or anything goes wrong.
export async function liveQuotes(symbols) {
  const list = [...new Set((symbols || []).filter(Boolean))].slice(0, 50);
  if (!list.length) return null;
  const data = await call(`/quotes?symbols=${encodeURIComponent(list.join(","))}`);
  if (!data?.quotes) return null;
  return Object.defineProperty(data.quotes, "meta", { value: { asOf: data.asOf, delayed: data.delayed }, enumerable: false });
}

export function getOptIn() {
  try { return localStorage.getItem(OPT_IN) === "yes"; } catch { return false; }
}

export function setOptIn(on) {
  try { localStorage.setItem(OPT_IN, on ? "yes" : "no"); } catch {}
}

// Sends one anonymous timing, only if you opted in. data: { minutes, lessonsDone }
export async function sendMetric(event, data = {}) {
  if (!WORKER || !getOptIn()) return;
  const body = {
    event,
    minutes: Math.max(0, Math.min(10000, Number(data.minutes) || 0)),
    lessonsDone: Math.max(0, Math.min(7, Math.round(Number(data.lessonsDone) || 0))),
    site: APP_ENV === "dev" ? "dev" : "live",
    v: 1,
  };
  await call("/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function metricsSummary(site = APP_ENV === "dev" ? "dev" : "live") {
  return call(`/metrics/summary${site === "dev" ? "?site=dev" : ""}`);
}
