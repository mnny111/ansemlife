import { describe, it, expect, vi } from "vitest";
import { signQuery, normalizePosition, fetchAsterPosition } from "./aster";
import { createHmac } from "node:crypto";

describe("signQuery", () => {
  it("appends a correct HMAC-SHA256 signature", () => {
    const q = signQuery({ symbol: "ANSEMUSDT", timestamp: 1000 }, "secret");
    const expectedSig = createHmac("sha256", "secret").update("symbol=ANSEMUSDT&timestamp=1000").digest("hex");
    expect(q).toBe(`symbol=ANSEMUSDT&timestamp=1000&signature=${expectedSig}`);
  });
});

describe("normalizePosition", () => {
  it("maps a long positionRisk row", () => {
    const raw = {
      symbol: "ANSEMUSDT", positionAmt: "100", entryPrice: "1.0", markPrice: "1.2",
      unRealizedProfit: "20", liquidationPrice: "0.9", leverage: "10", isolatedMargin: "10",
    };
    const s = normalizePosition(raw, "2026-06-29T00:00:00.000Z");
    expect(s).toEqual({
      timestamp: "2026-06-29T00:00:00.000Z", symbol: "ANSEMUSDT", status: "open", side: "long",
      leverage: 10, entryPrice: 1.0, sizeUsd: 120, marginUsd: 10, liquidationPrice: 0.9, unrealizedPnlUsd: 20,
    });
  });
  it("maps a flat position as closed", () => {
    const raw = {
      symbol: "ANSEMUSDT", positionAmt: "0", entryPrice: "0", markPrice: "1.2",
      unRealizedProfit: "0", liquidationPrice: "0", leverage: "10", isolatedMargin: "0",
    };
    expect(normalizePosition(raw, "t").status).toBe("closed");
    expect(normalizePosition(raw, "t").side).toBe("flat");
  });
});

describe("fetchAsterPosition", () => {
  it("calls the signed endpoint and returns the matching symbol snapshot", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/fapi/v2/positionRisk");
      expect(String(url)).toContain("signature=");
      expect((init?.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe("ak");
      return { ok: true, json: async () => [
        { symbol: "ANSEMUSDT", positionAmt: "100", entryPrice: "1.0", markPrice: "1.2",
          unRealizedProfit: "20", liquidationPrice: "0.9", leverage: "10", isolatedMargin: "10" },
      ] } as Response;
    }) as unknown as typeof fetch;
    const s = await fetchAsterPosition(
      { baseUrl: "https://fapi.asterdex.com", apiKey: "ak", apiSecret: "sk" },
      "ANSEMUSDT",
      { fetchImpl, nowMs: 1000, timestamp: "2026-06-29T00:00:00.000Z" },
    );
    expect(s.symbol).toBe("ANSEMUSDT");
    expect(s.sizeUsd).toBe(120);
  });
  it("throws on non-OK", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 } as Response)) as unknown as typeof fetch;
    await expect(
      fetchAsterPosition({ baseUrl: "https://x", apiKey: "ak", apiSecret: "sk" }, "ANSEMUSDT",
        { fetchImpl, nowMs: 1000 }),
    ).rejects.toThrow(/401/);
  });
});
