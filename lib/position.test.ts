import { describe, it, expect } from "vitest";
import { PositionSnapshotSchema, summarize, type PositionSnapshot } from "./position";

const snap = (over: Partial<PositionSnapshot>): PositionSnapshot => ({
  timestamp: "2026-06-29T00:00:00.000Z", symbol: "ANSEMUSDT", status: "open", side: "long",
  leverage: 10, entryPrice: 1, sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9,
  unrealizedPnlUsd: 0, ...over,
});

describe("PositionSnapshotSchema", () => {
  it("accepts a valid snapshot", () => {
    expect(PositionSnapshotSchema.safeParse(snap({})).success).toBe(true);
  });
  it("rejects negative leverage", () => {
    expect(PositionSnapshotSchema.safeParse(snap({ leverage: -1 })).success).toBe(false);
  });
});

describe("summarize", () => {
  it("zeroes for empty history", () => {
    expect(summarize([])).toEqual({ latest: null, deployedTotalUsd: 0, liquidatedCount: 0, survivedCount: 0 });
  });
  it("uses latest by timestamp, sums open margin, counts liquidations as open->closed transitions", () => {
    const a = snap({ timestamp: "2026-06-29T00:00:00.000Z", status: "open", marginUsd: 100 });
    const b = snap({ timestamp: "2026-06-30T00:00:00.000Z", status: "closed", side: "flat", marginUsd: 0 });
    const c = snap({ timestamp: "2026-07-01T00:00:00.000Z", status: "open", marginUsd: 250 });
    const s = summarize([a, b, c]);
    expect(s.latest?.timestamp).toBe("2026-07-01T00:00:00.000Z");
    expect(s.deployedTotalUsd).toBe(350);
    expect(s.liquidatedCount).toBe(1); // a(open) -> b(closed)
    expect(s.survivedCount).toBe(2);   // two distinct open episodes: [a] and [c]
  });
  it("de-duplicates margin within a single episode (consecutive opens count once)", () => {
    const a1 = snap({ timestamp: "2026-06-29T00:00:00.000Z", status: "open", marginUsd: 100 });
    const a2 = snap({ timestamp: "2026-06-29T01:00:00.000Z", status: "open", marginUsd: 100 });
    const a3 = snap({ timestamp: "2026-06-29T02:00:00.000Z", status: "open", marginUsd: 100 });
    const s = summarize([a1, a2, a3]);
    expect(s.deployedTotalUsd).toBe(100); // only first snapshot of the episode counts
    expect(s.survivedCount).toBe(1);       // one contiguous open run = one episode
    expect(s.liquidatedCount).toBe(0);
  });
});
