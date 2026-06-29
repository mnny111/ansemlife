"use client";
import { useEffect, useState } from "react";
import { usd } from "@/lib/format";

type Stats = {
  marketCapUsd: number | null;
  deployedUsd: number | null;
  pnlUsd: number | null;
};

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  return r.json();
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function LiveStatsStrip() {
  const [stats, setStats] = useState<Stats>({ marketCapUsd: null, deployedUsd: null, pnlUsd: null });

  useEffect(() => {
    Promise.allSettled([getJson("/api/price"), getJson("/api/position")]).then(([priceRes, posRes]) => {
      const price = priceRes.status === "fulfilled" ? (priceRes.value as Record<string, unknown>) : {};
      const pos = posRes.status === "fulfilled" ? (posRes.value as Record<string, unknown>) : {};
      const live = (pos.live as Record<string, unknown> | null) ?? null;
      setStats({
        marketCapUsd: asNum(price.marketCapUsd),
        deployedUsd: asNum(pos.deployedTotalUsd),
        pnlUsd: live ? asNum(live.unrealizedPnlUsd) : null,
      });
    });
  }, []);

  const items: { label: string; value: string; tone?: "pos" | "neg" }[] = [
    { label: "Market Cap", value: usd(stats.marketCapUsd) },
    { label: "Rewards Deployed", value: usd(stats.deployedUsd) },
    {
      label: "Position PnL",
      value: usd(stats.pnlUsd),
      tone: stats.pnlUsd == null ? undefined : stats.pnlUsd >= 0 ? "pos" : "neg",
    },
  ];

  return (
    <div className="grid grid-cols-1 divide-y divide-white/10 border-y border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((it) => (
        <div key={it.label} className="px-6 py-8">
          <div
            className={`font-display text-4xl font-black tracking-tight sm:text-5xl ${
              it.tone === "pos" ? "text-accent" : it.tone === "neg" ? "text-red-400" : "text-white"
            }`}
          >
            {it.value}
          </div>
          <div className="mt-2 text-xs uppercase tracking-widest text-white/40">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
