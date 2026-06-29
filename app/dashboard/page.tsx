"use client";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { PositionPanel } from "@/components/PositionPanel";
import { usd, sol } from "@/lib/format";

// Page-boundary JSON from internal API routes; typed loosely on purpose.
type State = {
  rewards?: { sol: number; error?: string };
  price?: { priceUsd: number; marketCapUsd: number | null; symbol: string; error?: string };
  position?: { live: any; liveError: string | null; deployedTotalUsd: number; liquidatedCount: number; survivedCount: number; history: any[] };
};

async function getJson(url: string) {
  const r = await fetch(url);
  return r.json();
}

export default function Dashboard() {
  const [s, setS] = useState<State>({});
  useEffect(() => {
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
  const history: any[] = pos?.history ?? [];
  const sortedHistory = [...history].sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp)),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold">Live Dashboard</h1>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards collected" value={s.rewards?.error ? "—" : sol(s.rewards?.sol ?? 0)} />
        <StatCard label="Total deployed" value={usd(pos?.deployedTotalUsd ?? 0)} />
        <StatCard
          label={`Target price${s.price?.symbol ? ` (${s.price.symbol})` : ""}`}
          value={s.price?.error ? "—" : usd(s.price?.priceUsd ?? null)}
          sub={pos ? `${pos.survivedCount} positions · ${pos.liquidatedCount} liquidations` : undefined}
        />
      </section>
      <PositionPanel live={pos?.live ?? null} liveError={pos?.liveError ?? null} />
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">History</h2>
        {sortedHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-gray-500">No snapshots recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
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
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
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
