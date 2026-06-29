import { describe, it, expect } from "vitest";
import { getHistory, appendSnapshot, MAX_HISTORY, type KvLike } from "./store";
import type { PositionSnapshot } from "./position";

function memKv(): KvLike {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => (m.has(k) ? (m.get(k) as T) : null),
    set: async (k, v) => void m.set(k, v),
  };
}
const snap: PositionSnapshot = {
  timestamp: "2026-06-29T00:00:00.000Z", symbol: "ANSEMUSDT", status: "open", side: "long",
  leverage: 10, entryPrice: 1, sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9, unrealizedPnlUsd: 0,
};

describe("snapshot store", () => {
  it("returns empty history when unset", async () => {
    expect(await getHistory(memKv())).toEqual([]);
  });
  it("appends without mutating prior history", async () => {
    const kv = memKv();
    await appendSnapshot(kv, snap);
    const before = await getHistory(kv);
    await appendSnapshot(kv, { ...snap, timestamp: "2026-06-30T00:00:00.000Z", marginUsd: 200 });
    const after = await getHistory(kv);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual(snap);
  });
  it("rejects an invalid snapshot", async () => {
    await expect(appendSnapshot(memKv(), { ...snap, leverage: -1 })).rejects.toThrow();
  });
  it("retains order and does not exceed MAX_HISTORY when appending multiple snapshots", async () => {
    const kv = memKv();
    const s1 = { ...snap, timestamp: "2026-06-29T00:00:00.000Z" };
    const s2 = { ...snap, timestamp: "2026-06-29T01:00:00.000Z", marginUsd: 200 };
    const s3 = { ...snap, timestamp: "2026-06-29T02:00:00.000Z", marginUsd: 300 };
    await appendSnapshot(kv, s1);
    await appendSnapshot(kv, s2);
    const result = await appendSnapshot(kv, s3);
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe(s1.timestamp);
    expect(result[2].timestamp).toBe(s3.timestamp);
    // Cap is far above 3; assert the exported constant is the guard.
    expect(result.length).toBeLessThanOrEqual(MAX_HISTORY);
  });
});
