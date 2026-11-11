"use client";

import { useRef, useState } from "react";
import { exportBackup, importBackup } from "@/lib/backup";

const summary = (c) => `${c.calls} calls, ${c.trades} paper trades, ${c.favorites} favourites, ${c.lessons} lessons done`;

// Save or restore everything this browser keeps (calls, favourites, lessons, paper trades)
export default function Backup({ onRestored }) {
  const input = useRef(null);
  const [msg, setMsg] = useState("");
  return (
    <section className="card">
      <h2>Back up your journal</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Your calls, paper trades, favourites and lesson progress are saved only in this browser. Save a backup file to keep them safe, or to move them to another device.
      </p>
      <div className="row">
        <button type="button" className="ghost" onClick={() => setMsg(`Saved: ${summary(exportBackup())}.`)}>Save backup file</button>
        <button type="button" className="ghost" onClick={() => input.current.click()}>Restore from file</button>
        <input ref={input} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files[0];
          e.target.value = "";
          if (!f) return;
          try {
            const c = await importBackup(f);
            setMsg(`Restored and merged. You now have ${summary(c)}.`);
            onRestored?.();
          } catch (err) { setMsg(err.message); }
        }} />
      </div>
      {msg && <p className="small" style={{ marginBottom: 0 }}>{msg}</p>}
    </section>
  );
}
