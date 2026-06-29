import { usd } from "@/lib/format";

type Live = {
  status: string; side: string; leverage: number; entryPrice: number;
  liquidationPrice: number; unrealizedPnlUsd: number; timestamp: string;
} | null;

export function PositionPanel({ live, liveError }: { live: Live; liveError: string | null }) {
  if (!live) return <div className="text-white/50">No position data yet{liveError ? ` (${liveError})` : ""}.</div>;
  return (
    <div className="rounded-xl border border-white/10 p-5 space-y-2">
      <div className="flex justify-between">
        <span className="font-semibold">Live position — {live.side} ({live.status})</span>
        <span className="text-xs text-white/40">
          {liveError ? `stale: ${liveError}` : `as of ${live.timestamp}`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-white/40">Leverage</div><div>{live.leverage}x</div></div>
        <div><div className="text-white/40">Entry</div><div>{usd(live.entryPrice)}</div></div>
        <div><div className="text-white/40">Liq. price</div><div>{usd(live.liquidationPrice)}</div></div>
        <div><div className="text-white/40">Unrealized PnL</div><div>{usd(live.unrealizedPnlUsd)}</div></div>
      </div>
    </div>
  );
}
