"use client";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { PriceChart } from "@/components/PriceChart";
import { PositionTable, type PositionRow } from "@/components/PositionTable";
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
    history: any[];
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
  const history: any[] = pos?.history ?? [];
  const sortedHistory = [...history].sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp)),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold">Live Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards collected" value={s.rewards?.error ? "—" : sol(s.rewards?.sol ?? 0)} />
        <StatCard label="Total deployed" value={usd(pos?.deployedTotalUsd ?? 0)} />
        <StatCard
          label={`Target price${s.price?.symbol ? ` (${s.price.symbol})` : ""}`}
          value={s.price?.error ? "—" : usd(s.price?.priceUsd ?? null)}
          sub={hasCounts ? `${pos!.survivedCount} positions · ${pos!.liquidatedCount} liquidations` : undefined}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Chart</h2>
        <PriceChart height={460} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Position{preview && !pos?.live ? <span className="ml-2 text-xs text-amber-400/80">preview (sample data)</span> : null}
        </h2>
        <PositionTable live={livePosition} liveError={pos?.liveError ?? null} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">History</h2>
        {sortedHistory.length === 0 ? (
          <p className="text-sm text-white/50">No snapshots recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Side</th>
                  <th className="py-2 pr-4 font-medium">Leverage</th>
                  <th className="py-2 pr-4 font-medium">Entry</th>
                  <th className="py-2 font-medium">Unrealized PnL</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((snap, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-4 text-white/60 whitespace-nowrap">
                      {snap.timestamp ? new Date(snap.timestamp).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4 capitalize">{snap.status ?? "—"}</td>
                    <td className="py-2 pr-4 capitalize">{snap.side ?? "—"}</td>
                    <td className="py-2 pr-4">{snap.leverage != null ? `${snap.leverage}x` : "—"}</td>
                    <td className="py-2 pr-4">{usd(snap.entryPrice ?? null)}</td>
                    <td className="py-2">{usd(snap.unrealizedPnlUsd ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Disclaimer />
    </main>
  );
}
