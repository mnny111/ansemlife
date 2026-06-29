import { createHmac } from "node:crypto";
import { z } from "zod";
import { PositionSnapshotSchema, type PositionSnapshot } from "./position";

export type AsterCreds = { baseUrl: string; apiKey: string; apiSecret: string };

export function signQuery(params: Record<string, string | number>, secret: string): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signature = createHmac("sha256", secret).update(query).digest("hex");
  return `${query}&signature=${signature}`;
}

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
  opts: { fetchImpl?: typeof fetch; nowMs?: number; timestamp?: string } = {},
): Promise<PositionSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const timestamp = opts.timestamp ?? new Date(nowMs).toISOString();
  const query = signQuery({ symbol, timestamp: nowMs }, creds.apiSecret);
  const url = `${creds.baseUrl}/fapi/v2/positionRisk?${query}`;
  const res = await fetchImpl(url, { headers: { "X-MBX-APIKEY": creds.apiKey } });
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
