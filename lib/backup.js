// Backup and restore: your calls, favourites, lesson progress and paper trades live only in this browser.
// A backup file lets you move them to another device, or keep them safe before clearing site data.
// Never includes API keys or saved Claude analyses.

import { STORE } from "./format";

const KEYS = {
  calls: `${STORE}calls:v1`,
  favorites: `${STORE}favorites:v1`,
  progress: `${STORE}options-progress:v1`,
  trades: `${STORE}paper-trades:v1`,
};

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export function exportBackup() {
  const data = Object.fromEntries(Object.entries(KEYS).map(([name, k]) => [name, read(k)]));
  const file = { app: "call-journal", kind: "backup", version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `call-journal-backup-${file.exportedAt.slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return counts(data);
}

// Merges a backup into what's already here: nothing already saved is lost.
// Calls and trades are matched by id; for a trade, the settled copy wins.
export async function importBackup(fileObj) {
  let file;
  try { file = JSON.parse(await fileObj.text()); } catch { throw new Error("That file isn't a Call Journal backup."); }
  if (file?.app !== "call-journal" || file.kind !== "backup" || typeof file.data !== "object") throw new Error("That file isn't a Call Journal backup.");
  const d = file.data;
  const byId = (mine, theirs, prefer) => {
    const out = new Map((Array.isArray(mine) ? mine : []).map((x) => [x.id, x]));
    for (const x of Array.isArray(theirs) ? theirs : []) {
      if (!x || typeof x.id !== "string") continue;
      const have = out.get(x.id);
      if (!have || (prefer && prefer(x, have))) out.set(x.id, x);
    }
    return [...out.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  };
  const merged = {
    calls: byId(read(KEYS.calls), d.calls, (x, have) => x.exitPrice != null && have.exitPrice == null),
    trades: byId(read(KEYS.trades), d.trades, (x, have) => !!x.settledAt && !have.settledAt),
    favorites: [...new Set([...(read(KEYS.favorites) || []), ...(Array.isArray(d.favorites) ? d.favorites : [])].filter((s) => typeof s === "string"))],
    progress: mergeProgress(read(KEYS.progress), d.progress),
  };
  try {
    for (const [name, k] of Object.entries(KEYS)) localStorage.setItem(k, JSON.stringify(merged[name]));
  } catch {
    throw new Error("Your browser couldn't save the backup (storage full or blocked).");
  }
  return counts(merged);
}

function mergeProgress(mine, theirs) {
  const a = mine && typeof mine === "object" ? mine : { done: {} };
  const b = theirs && typeof theirs === "object" ? theirs : { done: {} };
  const earliest = (x, y) => [x, y].filter((v) => typeof v === "string").sort()[0];
  const done = { ...(b.done || {}) };
  for (const [k, v] of Object.entries(a.done || {})) done[k] = earliest(v, done[k]);
  return { done, startedAt: earliest(a.startedAt, b.startedAt), finishedAt: earliest(a.finishedAt, b.finishedAt), firstTradeAt: earliest(a.firstTradeAt, b.firstTradeAt) };
}

function counts(d) {
  return {
    calls: Array.isArray(d.calls) ? d.calls.length : 0,
    trades: Array.isArray(d.trades) ? d.trades.length : 0,
    favorites: Array.isArray(d.favorites) ? d.favorites.length : 0,
    lessons: Object.keys(d.progress?.done || {}).length,
  };
}
