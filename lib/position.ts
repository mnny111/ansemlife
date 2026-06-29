import { z } from "zod";

export const PositionSnapshotSchema = z.object({
  timestamp: z.string(),
  symbol: z.string(),
  status: z.enum(["open", "closed"]),
  side: z.enum(["long", "short", "flat"]),
  leverage: z.number().nonnegative(),
  entryPrice: z.number().nonnegative(),
  sizeUsd: z.number().nonnegative(),
  marginUsd: z.number().nonnegative(),
  liquidationPrice: z.number().nonnegative(),
  unrealizedPnlUsd: z.number(),
});

export type PositionSnapshot = z.infer<typeof PositionSnapshotSchema>;

export function summarize(history: PositionSnapshot[]): {
  latest: PositionSnapshot | null; deployedTotalUsd: number;
  liquidatedCount: number; survivedCount: number;
} {
  if (history.length === 0)
    return { latest: null, deployedTotalUsd: 0, liquidatedCount: 0, survivedCount: 0 };
  const sorted = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = sorted[sorted.length - 1];
  const deployedTotalUsd = sorted
    .filter((s) => s.status === "open")
    .reduce((sum, s) => sum + s.marginUsd, 0);
  const survivedCount = sorted.filter((s) => s.status === "open").length;
  let liquidatedCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].status === "open" && sorted[i].status === "closed") liquidatedCount++;
  }
  return { latest, deployedTotalUsd, liquidatedCount, survivedCount };
}
