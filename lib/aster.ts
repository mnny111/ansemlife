import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { PositionSnapshotSchema, type PositionSnapshot } from "./position";

// V3 credentials: main account (`user`) + API wallet (`signer`) + its private key.
export type AsterCreds = { baseUrl: string; user: string; signer: string; privateKey: string };

// AsterDex V3 EIP-712 signing domain (api-docs V3).
export const ASTER_DOMAIN = {
  name: "AsterSignTransaction",
  version: "1",
  chainId: 1666,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;
export const ASTER_TYPES = { Message: [{ name: "msg", type: "string" }] } as const;

function paramString(params: Record<string, string | number>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.append(k, String(v));
  return usp.toString();
}

let nonceCounter = 0;
/** Microsecond nonce (ms precision + sub-counter for uniqueness within a ms). */
export function makeNonce(nowMs: number): number {
  nonceCounter = (nonceCounter + 1) % 1000;
  return nowMs * 1000 + nonceCounter;
}

/**
 * V3 signed query string. Appends user/signer/nonce, signs the URL-encoded
 * payload via EIP-712, and returns `<encoded params>&signature=<hex>`.
 * The signed string is exactly what is sent (minus the appended signature).
 */
export async function signV3(
  creds: AsterCreds,
  params: Record<string, string | number>,
  nonceMicros: number,
): Promise<string> {
  const msg = paramString({ ...params, nonce: nonceMicros, signer: creds.signer, user: creds.user });
  const account = privateKeyToAccount(creds.privateKey as `0x${string}`);
  const signature = await account.signTypedData({
    domain: ASTER_DOMAIN,
    types: ASTER_TYPES,
    primaryType: "Message",
    message: { msg },
  });
  return `${msg}&signature=${signature}`;
}

type SignedOpts = { fetchImpl?: typeof fetch; nowMs?: number; timestamp?: string; nonceMicros?: number };

const RawRowSchema = z.object({
  symbol: z.string(),
  positionAmt: z.string(),
  entryPrice: z.string(),
  markPrice: z.string(),
  unRealizedProfit: z.string(),
  liquidationPrice: z.string(),
  leverage: z.string(),
  isolatedMargin: z.string(),
});

export function normalizePosition(raw: unknown, timestamp: string): PositionSnapshot {
  const r = RawRowSchema.parse(raw);
  const amt = Number(r.positionAmt);
  const mark = Number(r.markPrice);
  const status = amt !== 0 ? "open" : "closed";
  const side = amt > 0 ? "long" : amt < 0 ? "short" : "flat";
  const snapshot: PositionSnapshot = {
    timestamp,
    symbol: r.symbol,
    status,
    side,
    leverage: Number(r.leverage),
    entryPrice: Number(r.entryPrice),
    sizeUsd: Math.abs(amt) * mark,
    marginUsd: Number(r.isolatedMargin),
    liquidationPrice: Number(r.liquidationPrice),
    unrealizedPnlUsd: Number(r.unRealizedProfit),
    markPrice: mark,
  };
  return PositionSnapshotSchema.parse(snapshot);
}

export async function fetchAsterPosition(
  creds: AsterCreds,
  symbol: string,
  opts: SignedOpts = {},
): Promise<PositionSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const timestamp = opts.timestamp ?? new Date(nowMs).toISOString();
  const query = await signV3(creds, { symbol }, opts.nonceMicros ?? makeNonce(nowMs));
  const res = await fetchImpl(`${creds.baseUrl}/fapi/v3/positionRisk?${query}`);
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const rawData: unknown = await res.json();
  const parsed = RawRowSchema.array().safeParse(rawData);
  if (!parsed.success) throw new Error("AsterDex returned malformed positionRisk response");
  const row = parsed.data.find((x) => x.symbol === symbol);
  if (!row) throw new Error(`AsterDex returned no position for ${symbol}`);
  return normalizePosition(row, timestamp);
}

export function roundToStep(qty: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(qty)) return 0;
  const multiples = Math.floor(qty / step + 1e-9);
  return Number((multiples * step).toFixed(8));
}

export function computeDeployQty(args: {
  availableBalance: number;
  deployFraction: number;
  leverage: number;
  markPrice: number;
  step: number;
}): number {
  const { availableBalance, deployFraction, leverage, markPrice, step } = args;
  if (!(markPrice > 0) || !(availableBalance > 0)) return 0;
  const notional = availableBalance * deployFraction * leverage;
  return roundToStep(notional / markPrice, step);
}

export type AccountBalance = { walletBalance: number; availableBalance: number; timestamp: string };

// V3 /fapi/v3/balance returns an array of per-asset balances.
const BalanceSchema = z.array(
  z.object({ asset: z.string(), balance: z.string(), availableBalance: z.string() }),
);

export async function fetchAccountBalance(creds: AsterCreds, opts: SignedOpts = {}): Promise<AccountBalance> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const timestamp = opts.timestamp ?? new Date(nowMs).toISOString();
  const query = await signV3(creds, {}, opts.nonceMicros ?? makeNonce(nowMs));
  const res = await fetchImpl(`${creds.baseUrl}/fapi/v3/balance?${query}`);
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const parsed = BalanceSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("AsterDex returned malformed balance response");
  const usdt = parsed.data.find((a) => a.asset === "USDT");
  if (!usdt) throw new Error("AsterDex balance: no USDT asset");
  return { walletBalance: Number(usdt.balance), availableBalance: Number(usdt.availableBalance), timestamp };
}

export type PriceMove = { pctMove: number; lastPrice: number };

const KlineSchema = z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string()]).rest(z.unknown()));

export async function recentPriceMove(
  creds: AsterCreds,
  symbol: string,
  windowMin: number,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<PriceMove> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${creds.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=${windowMin}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const parsed = KlineSchema.safeParse(await res.json());
  if (!parsed.success || parsed.data.length === 0) throw new Error("AsterDex returned malformed klines response");
  const highs = parsed.data.map((k) => Number(k[2]));
  const lows = parsed.data.map((k) => Number(k[3]));
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const lastPrice = Number(parsed.data[parsed.data.length - 1][4]);
  const pctMove = low > 0 ? ((high - low) / low) * 100 : 0;
  return { pctMove, lastPrice };
}

const ExchangeInfoSchema = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      filters: z.array(z.object({ filterType: z.string(), stepSize: z.string().optional() })),
    }),
  ),
});

export async function getSymbolStep(
  creds: AsterCreds,
  symbol: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${creds.baseUrl}/fapi/v1/exchangeInfo`);
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const parsed = ExchangeInfoSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("AsterDex returned malformed exchangeInfo response");
  const sym = parsed.data.symbols.find((s) => s.symbol === symbol);
  const lot = sym?.filters.find((f) => f.filterType === "LOT_SIZE" && f.stepSize);
  if (!lot?.stepSize) throw new Error(`no LOT_SIZE step for ${symbol}`);
  return Number(lot.stepSize);
}

async function signedPost(
  creds: AsterCreds,
  path: string,
  params: Record<string, string | number>,
  fetchImpl: typeof fetch,
  nonceMicros: number,
): Promise<Response> {
  const query = await signV3(creds, params, nonceMicros);
  return fetchImpl(`${creds.baseUrl}${path}?${query}`, { method: "POST" });
}

export async function setLeverage(
  creds: AsterCreds,
  symbol: string,
  leverage: number,
  opts: { fetchImpl?: typeof fetch; nowMs?: number; nonceMicros?: number } = {},
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nonce = opts.nonceMicros ?? makeNonce(opts.nowMs ?? Date.now());
  const res = await signedPost(creds, "/fapi/v3/leverage", { symbol, leverage }, fetchImpl, nonce);
  if (!res.ok) throw new Error(`AsterDex leverage error: ${res.status}`);
}

const OrderResultSchema = z.object({ orderId: z.number(), status: z.string() });

export async function openOrAddLong(
  creds: AsterCreds,
  args: { symbol: string; quantity: number },
  opts: { fetchImpl?: typeof fetch; nowMs?: number; nonceMicros?: number } = {},
): Promise<{ orderId: number; status: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nonce = opts.nonceMicros ?? makeNonce(opts.nowMs ?? Date.now());
  const res = await signedPost(
    creds,
    "/fapi/v3/order",
    { symbol: args.symbol, side: "BUY", type: "MARKET", quantity: args.quantity },
    fetchImpl,
    nonce,
  );
  if (!res.ok) throw new Error(`AsterDex order error: ${res.status}`);
  const parsed = OrderResultSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("AsterDex returned malformed order response");
  return parsed.data;
}
