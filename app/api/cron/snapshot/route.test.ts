import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/kv", () => ({
  vercelKv: {
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => void store.set(k, v),
  },
}));
vi.mock("@/lib/config", () => ({
  loadConfig: () => ({
    cronSecret: "cs", asterBaseUrl: "https://x", asterApiKey: "ak",
    asterApiSecret: "sk", asterSymbol: "ANSEMUSDT",
  }),
}));
const snapshot = {
  timestamp: "2026-06-29T00:00:00.000Z", symbol: "ANSEMUSDT", status: "open", side: "long",
  leverage: 10, entryPrice: 1, sizeUsd: 120, marginUsd: 10, liquidationPrice: 0.9, unrealizedPnlUsd: 20,
};
vi.mock("@/lib/aster", () => ({ fetchAsterPosition: async () => snapshot }));

import { GET, POST } from "./route";

describe("/api/cron/snapshot POST", () => {
  beforeEach(() => store.clear());
  it("rejects a bad secret", async () => {
    const res = await POST(new Request("http://t", { method: "POST", headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });
  it("appends a snapshot with the correct secret", async () => {
    const res = await POST(new Request("http://t", { method: "POST", headers: { authorization: "Bearer cs" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.snapshot.symbol).toBe("ANSEMUSDT");
    expect(store.get("ansemlife:snapshot-history")).toHaveLength(1);
  });
});

describe("/api/cron/snapshot GET", () => {
  beforeEach(() => store.clear());
  it("rejects a bad bearer token", async () => {
    const res = await GET(new Request("http://t", { method: "GET", headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });
  it("appends a snapshot with the correct bearer token", async () => {
    const res = await GET(new Request("http://t", { method: "GET", headers: { authorization: "Bearer cs" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.snapshot.symbol).toBe("ANSEMUSDT");
    expect(store.get("ansemlife:snapshot-history")).toHaveLength(1);
  });
});
