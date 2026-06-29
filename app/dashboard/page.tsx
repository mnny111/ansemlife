"use client";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { PriceChart } from "@/components/PriceChart";
import { PositionTable, type PositionRow } from "@/components/PositionTable";
import { Receipts } from "@/components/Receipts";
import { usd, sol } from "@/lib/format";

// Page-boundary JSON from internal API routes; typed loosely on purpose.
type State = {
  rewards?: { sol: number; error?: string };
  price?: { priceUsd: number; marketCapUsd: number | null; symbol: string; error?: string };
  position?: {
    live: PositionRow | null;
    liveError: string | null;
    deployedTotalUsd: number;
    liquidatedCount: number;
    survivedCount: number;
    history: unknown[];
  };
};

// Sample row matching a real AsterDex position, shown only with ?preview=1
// so the table layout can be reviewed before live data exists. Never persisted.
const PREVIEW_ROW: PositionRow = {
  symbol: "ZECUSDT",
  side: "short",
  status: "open",
  leverage: 10,
  entryPrice: 400.11,
  breakEvenPrice: 400.03,
  markPrice: 407.54,
  liquidationPrice: 437.44,
  marginRatioPct: 8.33,
  sizeUsd: 9777.6,
  marginUsd: 961.29,
  unrealizedPnlUsd: -178.09,
  realizedPnlUsd: -0.96,
  timestamp: "2026-06-29T00:00:00.000Z",
};

async function getJson(url: string) {
  const r = await fetch(url);
  return r.json();
}

export default function Dashboard() {
  const [s, setS] = useState<State>({});
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setPreview(new URLSearchParams(window.location.search).get("preview") === "1");
    Promise.allSettled([getJson("/api/rewards"), getJson("/api/price"), getJson("/api/position")])
      .then(([rewardsResult, priceResult, positionResult]) => {
        setS({
          rewards: rewardsResult.status === "fulfilled" ? rewardsResult.value : undefined,
          price: priceResult.status === "fulfilled" ? priceResult.value : undefined,
          position: positionResult.status === "fulfilled" ? positionResult.value : undefined,
        });
      });
  }, []);

  const pos = s.position;
  const livePosition = pos?.live ?? (preview ? PREVIEW_ROW : null);
  const hasCounts = typeof pos?.survivedCount === "number";

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-12">
      <h1 className="font-display text-4xl uppercase tracking-tight sm:text-5xl">Live Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards collected" value={s.rewards?.error ? "—" : sol(s.rewards?.sol ?? 0)} />
        <StatCard label="Total deployed" value={usd(pos?.deployedTotalUsd ?? 0)} />
        <StatCard
          label={`Target price${s.price?.symbol ? ` (${s.price.symbol})` : ""}`}
          value={s.price?.error ? "—" : usd(s.price?.priceUsd ?? null)}
          sub={hasCounts ? `${pos!.survivedCount} positions · ${pos!.liquidatedCount} liquidations` : undefined}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-bold">Chart</h2>
        <PriceChart height={460} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-bold">
          Position
          {preview && !pos?.live ? <span className="ml-2 text-xs text-amber-400/80">preview (sample data)</span> : null}
        </h2>
        <PositionTable live={livePosition} liveError={pos?.liveError ?? null} />
      </section>

      <Receipts sample={preview} />

      <Disclaimer />
    </main>
  );
}
