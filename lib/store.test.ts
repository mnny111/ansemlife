import { describe, it, expect } from "vitest";
import { getHistory, appendSnapshot, type KvLike } from "./store";
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
});
