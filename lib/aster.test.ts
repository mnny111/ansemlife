import { describe, it, expect, vi } from "vitest";
import { signQuery, normalizePosition, fetchAsterPosition, roundToStep, computeDeployQty, fetchAccountBalance, recentPriceMove, getSymbolStep, setLeverage, openOrAddLong } from "./aster";
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
      markPrice: 1.2,
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
  it("maps a short positionRisk row", () => {
    const raw = {
      symbol: "ANSEMUSDT", positionAmt: "-50", entryPrice: "1.0", markPrice: "1.2",
      unRealizedProfit: "0", liquidationPrice: "1.5", leverage: "10", isolatedMargin: "10",
    };
    const s = normalizePosition(raw, "2026-06-29T00:00:00.000Z");
    expect(s.side).toBe("short");
    expect(s.status).toBe("open");
    expect(s.sizeUsd).toBe(60);
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
  it("throws when no matching symbol in response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, json: async () => [
        { symbol: "BTCUSDT", positionAmt: "100", entryPrice: "1.0", markPrice: "1.2",
          unRealizedProfit: "20", liquidationPrice: "0.9", leverage: "10", isolatedMargin: "10" },
      ],
    } as Response)) as unknown as typeof fetch;
    await expect(
      fetchAsterPosition({ baseUrl: "https://x", apiKey: "ak", apiSecret: "sk" }, "ANSEMUSDT",
        { fetchImpl, nowMs: 1000 }),
    ).rejects.toThrow(/AsterDex returned no position for ANSEMUSDT/);
  });
});

describe("roundToStep", () => {
  it("floors to the step multiple", () => {
    expect(roundToStep(12.3456, 0.001)).toBe(12.345);
    expect(roundToStep(7, 1)).toBe(7);
    expect(roundToStep(0.4, 1)).toBe(0);
  });
  it("returns 0 for a non-positive step", () => {
    expect(roundToStep(5, 0)).toBe(0);
  });
});

describe("computeDeployQty", () => {
  it("sizes notional = balance*fraction*leverage / markPrice, floored to step", () => {
    // 100 * 0.95 * 10 = 950 notional; /2 mark = 475 units; step 0.1 -> 475
    expect(
      computeDeployQty({ availableBalance: 100, deployFraction: 0.95, leverage: 10, markPrice: 2, step: 0.1 }),
    ).toBe(475);
  });
  it("returns 0 when markPrice is non-positive", () => {
    expect(
      computeDeployQty({ availableBalance: 100, deployFraction: 0.95, leverage: 10, markPrice: 0, step: 0.1 }),
    ).toBe(0);
  });
});

describe("fetchAccountBalance", () => {
  it("parses wallet and available balance from /fapi/v2/account", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/fapi/v2/account");
      expect(String(url)).toContain("signature=");
      expect((init?.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe("pub");
      return new Response(JSON.stringify({ totalWalletBalance: "1234.50", availableBalance: "1000.00" }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await fetchAccountBalance(
      { baseUrl: "https://x", apiKey: "pub", apiSecret: "sec" },
      { fetchImpl, nowMs: 1000, timestamp: "2026-06-29T00:00:00.000Z" },
    );
    expect(out).toEqual({ walletBalance: 1234.5, availableBalance: 1000, timestamp: "2026-06-29T00:00:00.000Z" });
  });

  it("throws on non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(
      fetchAccountBalance({ baseUrl: "https://x", apiKey: "p", apiSecret: "s" }, { fetchImpl }),
    ).rejects.toThrow("AsterDex error: 401");
  });
});

describe("recentPriceMove", () => {
  const klines = [
    [0, "100", "102", "99", "101"],
    [0, "101", "105", "100", "104"], // window high 105, low 99
  ];
  it("computes range pct move and last close", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/fapi/v1/klines");
      expect(String(url)).toContain("interval=1m");
      expect(String(url)).toContain("limit=5");
      return new Response(JSON.stringify(klines), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await recentPriceMove({ baseUrl: "https://x", apiKey: "p", apiSecret: "s" }, "ANSEMUSDT", 5, { fetchImpl });
    // (105-99)/99*100 = 6.0606...
    expect(out.pctMove).toBeCloseTo(6.0606, 3);
    expect(out.lastPrice).toBe(104);
  });
  it("throws on non-ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(
      recentPriceMove({ baseUrl: "https://x", apiKey: "p", apiSecret: "s" }, "S", 5, { fetchImpl }),
    ).rejects.toThrow("AsterDex error: 500");
  });
});

describe("getSymbolStep", () => {
  const info = {
    symbols: [
      { symbol: "OTHER", filters: [{ filterType: "LOT_SIZE", stepSize: "1" }] },
      { symbol: "ANSEMUSDT", filters: [{ filterType: "PRICE_FILTER", tickSize: "0.01" }, { filterType: "LOT_SIZE", stepSize: "0.001" }] },
    ],
  };
  it("returns the LOT_SIZE step for the symbol", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/fapi/v1/exchangeInfo");
      return new Response(JSON.stringify(info), { status: 200 });
    }) as unknown as typeof fetch;
    const step = await getSymbolStep({ baseUrl: "https://x", apiKey: "p", apiSecret: "s" }, "ANSEMUSDT", { fetchImpl });
    expect(step).toBe(0.001);
  });
  it("throws when the symbol is absent", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ symbols: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(
      getSymbolStep({ baseUrl: "https://x", apiKey: "p", apiSecret: "s" }, "ANSEMUSDT", { fetchImpl }),
    ).rejects.toThrow("no LOT_SIZE step for ANSEMUSDT");
  });
});

describe("setLeverage", () => {
  it("POSTs a signed leverage request", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String(url)).toContain("/fapi/v1/leverage");
      expect(String(url)).toContain("symbol=ANSEMUSDT");
      expect(String(url)).toContain("leverage=10");
      expect(String(url)).toContain("signature=");
      expect((init?.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe("trd");
      return new Response(JSON.stringify({ leverage: 10, symbol: "ANSEMUSDT" }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      setLeverage({ baseUrl: "https://x", apiKey: "trd", apiSecret: "s" }, "ANSEMUSDT", 10, { fetchImpl, nowMs: 1 }),
    ).resolves.toBeUndefined();
  });
  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(
      setLeverage({ baseUrl: "https://x", apiKey: "trd", apiSecret: "s" }, "ANSEMUSDT", 10, { fetchImpl, nowMs: 1 }),
    ).rejects.toThrow("AsterDex leverage error: 500");
  });
});

describe("openOrAddLong", () => {
  it("POSTs a signed market BUY and returns orderId/status", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String(url)).toContain("/fapi/v1/order");
      expect(String(url)).toContain("side=BUY");
      expect(String(url)).toContain("type=MARKET");
      expect(String(url)).toContain("quantity=12.5");
      return new Response(JSON.stringify({ orderId: 777, status: "NEW" }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await openOrAddLong(
      { baseUrl: "https://x", apiKey: "trd", apiSecret: "s" },
      { symbol: "ANSEMUSDT", quantity: 12.5 },
      { fetchImpl, nowMs: 1 },
    );
    expect(out).toEqual({ orderId: 777, status: "NEW" });
  });
  it("throws on a rejected order", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: -2019, msg: "Margin is insufficient." }), { status: 400 })) as unknown as typeof fetch;
    await expect(
      openOrAddLong({ baseUrl: "https://x", apiKey: "trd", apiSecret: "s" }, { symbol: "S", quantity: 1 }, { fetchImpl, nowMs: 1 }),
    ).rejects.toThrow("AsterDex order error: 400");
  });
});
