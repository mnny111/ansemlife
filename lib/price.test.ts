import { describe, it, expect, vi } from "vitest";
import { fetchTokenPrice } from "./price";

const ok = (body: unknown) => ({ ok: true, json: async () => body } as Response);

describe("fetchTokenPrice", () => {
  it("parses DexScreener pair response", async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ pairs: [{ priceUsd: "1.25", marketCap: 100000000, baseToken: { symbol: "ANSEM" } }] }),
    ) as unknown as typeof fetch;
    const p = await fetchTokenPrice("solana/abc", fetchImpl);
    expect(p).toEqual({ priceUsd: 1.25, marketCapUsd: 100000000, symbol: "ANSEM" });
  });
  it("throws on non-OK", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(fetchTokenPrice("x", fetchImpl)).rejects.toThrow(/500/);
  });
  it("throws on missing pairs", async () => {
    const fetchImpl = vi.fn(async () => ok({ pairs: [] })) as unknown as typeof fetch;
    await expect(fetchTokenPrice("x", fetchImpl)).rejects.toThrow(/no pair/i);
  });
});
