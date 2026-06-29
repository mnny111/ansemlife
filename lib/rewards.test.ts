import { describe, it, expect, vi } from "vitest";
import { fetchRewardsBalance } from "./rewards";

describe("fetchRewardsBalance", () => {
  it("converts lamports to SOL", async () => {
    const impl = vi.fn(async () => 2_500_000_000);
    const r = await fetchRewardsBalance("https://rpc", "wallet", impl);
    expect(r).toEqual({ lamports: 2_500_000_000, sol: 2.5 });
    expect(impl).toHaveBeenCalledWith("https://rpc", "wallet");
  });
  it("throws on invalid balance", async () => {
    const impl = vi.fn(async () => Number.NaN);
    await expect(fetchRewardsBalance("https://rpc", "wallet", impl)).rejects.toThrow(/invalid/i);
  });
});
