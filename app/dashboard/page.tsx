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
    Promise.all([getJson("/api/rewards"), getJson("/api/price"), getJson("/api/position")])
      .then(([rewards, price, position]) => setS({ rewards, price, position }))
      .catch(() => setS({}));
  }, []);

  const pos = s.position;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold">Live Dashboard</h1>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards collected" value={s.rewards?.error ? "—" : sol(s.rewards?.sol ?? 0)} />
        <StatCard label="Total deployed" value={usd(pos?.deployedTotalUsd ?? 0)} />
        <StatCard
          label={`Target price${s.price?.symbol ? ` (${s.price.symbol})` : ""}`}
          value={s.price?.error ? "—" : usd(s.price?.priceUsd ?? null)}
          sub={pos ? `${pos.survivedCount} open snapshots · ${pos.liquidatedCount} liquidations` : undefined}
        />
      </section>
      <PositionPanel live={pos?.live ?? null} liveError={pos?.liveError ?? null} />
      <Disclaimer />
    </main>
  );
}
