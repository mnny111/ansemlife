import { z } from "zod";

export type TokenPrice = { priceUsd: number; marketCapUsd: number | null; symbol: string };

const PairSchema = z.object({
  priceUsd: z.string(),
  marketCap: z.number().nullable().optional(),
  baseToken: z.object({ symbol: z.string() }),
});
const ResponseSchema = z.object({ pairs: z.array(PairSchema).nullable() });

const BASE = "https://api.dexscreener.com/latest/dex/pairs/";

export async function fetchTokenPrice(
  pairUrlOrId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenPrice> {
  const url = pairUrlOrId.startsWith("http") ? pairUrlOrId : BASE + pairUrlOrId;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
  const parsed = ResponseSchema.parse(await res.json());
  const pair = parsed.pairs?.[0];
  if (!pair) throw new Error("DexScreener returned no pair");
  return {
    priceUsd: Number(pair.priceUsd),
    marketCapUsd: pair.marketCap ?? null,
    symbol: pair.baseToken.symbol,
  };
}
