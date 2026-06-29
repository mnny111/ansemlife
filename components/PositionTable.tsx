export interface PositionRow {
  symbol: string;
  side: "long" | "short" | "flat";
  status: string;
  leverage: number;
  entryPrice: number;
  markPrice?: number;
  liquidationPrice: number;
  sizeUsd: number;
  marginUsd: number;
  unrealizedPnlUsd: number;
  timestamp?: string;
  // Not available from AsterDex positionRisk — optional so a preview/sample can show them.
  breakEvenPrice?: number;
  marginRatioPct?: number;
  realizedPnlUsd?: number;
}

interface PositionTableProps {
  live: PositionRow | null;
  liveError: string | null;
}

const COLUMNS = [
  "Perpetual",
  "Open Interest",
  "Avg Entry Price",
  "Break-even Price",
  "Mark Price",
  "Est. Liq Price",
  "Margin Ratio",
  "Margin",
  "Unrealized PNL",
  "Realized PNL",
] as const;

function num(n: number | undefined | null, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pnlClass(n: number | undefined): string {
  if (n == null || n === 0) return "text-white/70";
  return n > 0 ? "text-emerald-400" : "text-red-400";
}

function splitSymbol(symbol: string): { base: string; quote: string } {
  const quotes = ["USDT", "USDC", "USD"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) return { base: symbol.slice(0, -q.length), quote: q };
  }
  return { base: symbol, quote: "" };
}

export function PositionTable({ live, liveError }: PositionTableProps) {
  const { base, quote } = live ? splitSymbol(live.symbol) : { base: "", quote: "" };
  const isShort = live?.side === "short";
  const roePct =
    live && live.marginUsd > 0 ? (live.unrealizedPnlUsd / live.marginUsd) * 100 : undefined;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0d0f] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-sm font-semibold text-white/80">Position</span>
        <span className="text-xs text-white/40">
          {live
            ? liveError
              ? `stale: ${liveError}`
              : live.timestamp
                ? `as of ${new Date(live.timestamp).toLocaleString()}`
                : ""
            : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-right text-white/40 text-xs border-b border-white/10">
              {COLUMNS.map((c, i) => (
                <th key={c} className={`px-4 py-2 font-medium ${i === 0 ? "text-left" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!live ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-white/40">
                  No open position{liveError ? ` (${liveError})` : ""}.
                </td>
              </tr>
            ) : (
              <tr className="text-right border-l-2" style={{ borderLeftColor: isShort ? "#f87171" : "#34d399" }}>
                <td className="px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {base}
                      <span className="text-white/40">/{quote}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        isShort ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {isShort ? "Short" : live.side === "long" ? "Long" : "Flat"}
                    </span>
                    <span className="text-white/40">Isolated</span>
                    <span className="text-white/40">{live.leverage}X</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {num(live.sizeUsd)} <span className="text-white/40 text-xs">{quote}</span>
                </td>
                <td className="px-4 py-3">{num(live.entryPrice)}</td>
                <td className="px-4 py-3">{num(live.breakEvenPrice)}</td>
                <td className="px-4 py-3">{num(live.markPrice)}</td>
                <td className="px-4 py-3 text-amber-400">{num(live.liquidationPrice)}</td>
                <td className="px-4 py-3">
                  {live.marginRatioPct != null ? `${num(live.marginRatioPct)}%` : "—"}
                </td>
                <td className="px-4 py-3">{num(live.marginUsd)}</td>
                <td className={`px-4 py-3 ${pnlClass(live.unrealizedPnlUsd)}`}>
                  <div>{num(live.unrealizedPnlUsd)}</div>
                  {roePct != null ? <div className="text-xs">{num(roePct)}%</div> : null}
                </td>
                <td className={`px-4 py-3 ${pnlClass(live.realizedPnlUsd)}`}>
                  {num(live.realizedPnlUsd)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
