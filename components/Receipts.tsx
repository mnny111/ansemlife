"use client";
import { useEffect, useState } from "react";

interface ReceiptRow {
  timestamp?: string;
  symbol?: string;
  side?: string;
  leverage?: number;
  entryPrice?: number;
  markPrice?: number;
  sizeUsd?: number;
  marginUsd?: number;
  unrealizedPnlUsd?: number;
}

// Shown only when there is no real history yet and `sample` is set (preview).
const SAMPLE_RECEIPTS: ReceiptRow[] = [
  { timestamp: "2026-06-29T12:00:00.000Z", symbol: "ZECUSDT", side: "long", leverage: 10, entryPrice: 392.4, markPrice: 407.5, sizeUsd: 9777.6, marginUsd: 961.29, unrealizedPnlUsd: 374.1 },
  { timestamp: "2026-06-28T09:30:00.000Z", symbol: "ZECUSDT", side: "long", leverage: 10, entryPrice: 388.1, markPrice: 407.5, sizeUsd: 6120.0, marginUsd: 612.0, unrealizedPnlUsd: 305.8 },
];

function num(n: number | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pnlClass(n: number | undefined): string {
  if (n == null || n === 0) return "text-white/70";
  return n > 0 ? "text-accent" : "text-red-400";
}

interface ReceiptsProps {
  limit?: number;
  sample?: boolean;
}

export function Receipts({ limit, sample = false }: ReceiptsProps) {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const wallet = process.env.NEXT_PUBLIC_REWARD_WALLET ?? "";

  useEffect(() => {
    fetch("/api/position")
      .then((r) => r.json())
      .then((data: unknown) => {
        const history = (data as { history?: ReceiptRow[] }).history ?? [];
        setRows([...history].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))));
      })
      .catch(() => setRows([]));
  }, []);

  const display = rows.length > 0 ? rows : sample ? SAMPLE_RECEIPTS : [];
  const shown = limit ? display.slice(0, limit) : display;
  const isSample = rows.length === 0 && sample && display.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Receipts</p>
          <h2 className="mt-1 font-display text-4xl font-black tracking-tight sm:text-5xl">
            Rewards that bought the long.
          </h2>
          <p className="mt-2 text-sm text-white/50">
            Every creator reward fee, deployed into the 10x long — on the record.
            {isSample ? <span className="ml-2 text-amber-400/80">preview (sample data)</span> : null}
          </p>
        </div>
        {wallet ? (
          <a
            href={`https://solscan.io/account/${wallet}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:border-accent hover:text-accent"
          >
            Reward wallet ↗
          </a>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0c0c0e]">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-white/10 text-right text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Deployed</th>
              <th className="px-4 py-3 font-medium">Long</th>
              <th className="px-4 py-3 font-medium">Entry</th>
              <th className="px-4 py-3 font-medium">Mark</th>
              <th className="px-4 py-3 font-medium">Unrealized PnL</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-white/40">
                  No receipts yet — deployments appear here as creator rewards fund the long.
                </td>
              </tr>
            ) : (
              shown.map((r, i) => (
                <tr key={i} className="border-b border-white/5 text-right last:border-0 hover:bg-white/5">
                  <td className="px-4 py-3 text-left text-white/60">
                    {r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">${num(r.marginUsd)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono">${num(r.sizeUsd)}</span>
                    <span className="ml-1 text-xs text-white/40">{r.leverage ? `${r.leverage}x` : ""}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">{num(r.entryPrice)}</td>
                  <td className="px-4 py-3 font-mono">{num(r.markPrice)}</td>
                  <td className={`px-4 py-3 font-mono ${pnlClass(r.unrealizedPnlUsd)}`}>{num(r.unrealizedPnlUsd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
