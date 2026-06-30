import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchAccountBalance } = vi.hoisted(() => ({ fetchAccountBalance: vi.fn() }));

vi.mock("@/lib/config", () => ({
  loadConfig: () => ({ asterBaseUrl: "https://x", asterUser: "0xuser", asterSigner: "0xsigner", asterPrivateKey: "0xkey" }),
}));
vi.mock("@/lib/aster", () => ({ fetchAccountBalance }));

import { GET } from "./route";

describe("GET /api/balance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the normalized balance", async () => {
    fetchAccountBalance.mockResolvedValue({ walletBalance: 1000, availableBalance: 250, timestamp: "2026-06-29T00:00:00.000Z" });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ walletBalance: 1000, availableBalance: 250, timestamp: "2026-06-29T00:00:00.000Z" });
  });

  it("returns 502 on a read failure", async () => {
    fetchAccountBalance.mockImplementation(async () => {
      throw new Error("AsterDex error: 401");
    });
    const res = await GET();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "AsterDex error: 401" });
  });
});
