"use client";

/**
 * Embedded price chart for the target token.
 *
 * Configure via env (both optional):
 * - NEXT_PUBLIC_CHART_EMBED_URL — a full iframe embed URL (DexScreener,
 *   GeckoTerminal, TradingView, etc.). Takes precedence when set.
 * - NEXT_PUBLIC_CHART_SYMBOL — a TradingView symbol (e.g. "BINANCE:ZECUSDT").
 *   Used to build a TradingView embed when no full URL is provided.
 *
 * Falls back to BINANCE:ZECUSDT so the chart renders before real config exists.
 */

const DEFAULT_SYMBOL = "BINANCE:ZECUSDT";

function tradingViewUrl(symbol: string): string {
  const params = new URLSearchParams({
    symbol,
    interval: "60",
    theme: "dark",
    style: "1",
    timezone: "Etc/UTC",
    hide_side_toolbar: "1",
    allow_symbol_change: "0",
    locale: "en",
  });
  return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
}

interface PriceChartProps {
  height?: number;
  className?: string;
}

export function PriceChart({ height = 420, className }: PriceChartProps) {
  const embedUrl = process.env.NEXT_PUBLIC_CHART_EMBED_URL;
  const symbol = process.env.NEXT_PUBLIC_CHART_SYMBOL ?? DEFAULT_SYMBOL;
  const src = embedUrl && embedUrl.length > 0 ? embedUrl : tradingViewUrl(symbol);

  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-white/5 ${className ?? ""}`}>
      <iframe
        src={src}
        title="Ansem token price chart"
        className="w-full"
        style={{ height }}
        loading="lazy"
        allow="clipboard-write"
      />
    </div>
  );
}
