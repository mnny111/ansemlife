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
  // Compute episodes: maximal contiguous runs of open snapshots.
  // deployedTotalUsd = sum of the FIRST snapshot's marginUsd per episode.
  // survivedCount = number of such episodes.
  // liquidatedCount = number of open→closed adjacent transitions (unchanged).
  let deployedTotalUsd = 0;
  let survivedCount = 0;
  let liquidatedCount = 0;
  let inEpisode = false;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.status === "open") {
      if (!inEpisode) {
        // Start of a new episode: count it and add its margin once.
        survivedCount++;
        deployedTotalUsd += cur.marginUsd;
        inEpisode = true;
      }
    } else {
      // closed snapshot
      if (inEpisode) {
        liquidatedCount++;
      }
      inEpisode = false;
    }
  }
  return { latest, deployedTotalUsd, liquidatedCount, survivedCount };
}
