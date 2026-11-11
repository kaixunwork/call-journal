"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import StockView from "@/components/StockView";

// One static page serves every stock: /stock/?s=AAPL
function StockFromQuery() {
  const symbol = (useSearchParams().get("s") || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-^]{1,15}$/.test(symbol)) {
    return <div className="card">No stock picked. <Link href="/stocks/">Search for one</Link></div>;
  }
  return <StockView key={symbol} symbol={symbol} />;
}

export default function StockPage() {
  return (
    <Suspense fallback={<div className="card muted">Loading…</div>}>
      <StockFromQuery />
    </Suspense>
  );
}
