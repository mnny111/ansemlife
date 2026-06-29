"use client";

/**
 * Embedded price chart for the target token ($ANSEM by default).
 *
 * Configure via env (all optional):
 * - NEXT_PUBLIC_CHART_EMBED_URL — a full iframe embed URL. Takes precedence.
 * - NEXT_PUBLIC_CHART_SOLANA_TOKEN — a Solana token/pair address; charted via
 *   DexScreener (right for pump.fun / Solana memecoins).
 * - NEXT_PUBLIC_CHART_SYMBOL — a TradingView symbol (e.g. "BINANCE:ZECUSDT"),
 *   used only when no Solana token is configured.
 *
 * Defaults to $ANSEM on DexScreener so the chart renders without config.
 */

const DEFAULT_SOLANA_TOKEN = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump"; // $ANSEM

function dexScreenerUrl(token: string): string {
  return `https://dexscreener.com/solana/${token}?embed=1&theme=dark&trades=0&info=0`;
}

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

function resolveSrc(): string {
  const embedUrl = process.env.NEXT_PUBLIC_CHART_EMBED_URL;
  if (embedUrl && embedUrl.length > 0) return embedUrl;

  const solToken = process.env.NEXT_PUBLIC_CHART_SOLANA_TOKEN ?? DEFAULT_SOLANA_TOKEN;
  if (solToken && solToken.length > 0) return dexScreenerUrl(solToken);

  const symbol = process.env.NEXT_PUBLIC_CHART_SYMBOL ?? "BINANCE:ZECUSDT";
  return tradingViewUrl(symbol);
}

interface PriceChartProps {
  height?: number;
  className?: string;
}

export function PriceChart({ height = 420, className }: PriceChartProps) {
  const src = resolveSrc();

  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-white/5 ${className ?? ""}`}>
      <iframe
        src={src}
        title="$ANSEM price chart"
        className="w-full"
        style={{ height }}
        loading="lazy"
        allow="clipboard-write"
      />
    </div>
  );
}
