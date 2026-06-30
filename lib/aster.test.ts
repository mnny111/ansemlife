import { describe, it, expect, vi } from "vitest";
import {
  signV3, makeNonce, normalizePosition, fetchAsterPosition, roundToStep, computeDeployQty,
  fetchAccountBalance, recentPriceMove, getSymbolStep, setLeverage, openOrAddLong,
  ASTER_DOMAIN, ASTER_TYPES,
} from "./aster";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";

// Public demo key from AsterDex V3 docs — safe to use in tests.
const PK = "0x4fd0a42218f3eae43a6ce26d22544e986139a01e5b34a62db53757ffca81bae1" as const;
const ACCT = privateKeyToAccount(PK);
const USER = "0x63DD5aCC6b1aa0f563956C0e534DD30B6dcF7C4e";
const creds = { baseUrl: "https://fapi3.asterdex.com", user: USER, signer: ACCT.address, privateKey: PK };

describe("signV3", () => {
  it("appends user/signer/nonce and an EIP-712 signature that recovers to the signer", async () => {
    const query = await signV3(creds, { symbol: "ANSEMUSDT" }, 1748310859508867);
    expect(query).toContain("symbol=ANSEMUSDT");
    expect(query).toContain(`signer=${ACCT.address}`);
    expect(query).toContain(`user=${USER}`);
    expect(query).toContain("nonce=1748310859508867");
    const [msg, signature] = query.split("&signature=");
    const recovered = await recoverTypedDataAddress({
      domain: ASTER_DOMAIN,
      types: ASTER_TYPES,
      primaryType: "Message",
      message: { msg },
      signature: signature as `0x${string}`,
    });
    expect(recovered.toLowerCase()).toBe(ACCT.address.toLowerCase());
  });
});

describe("makeNonce", () => {
  it("returns a microsecond nonce in the ms*1000 window", () => {
    const n = makeNonce(1000);
    expect(n).toBeGreaterThanOrEqual(1_000_000);
    expect(n).toBeLessThan(1_001_000);
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

const ROW = {
  symbol: "ANSEMUSDT", positionAmt: "100", entryPrice: "1.0", markPrice: "1.2",
  unRealizedProfit: "20", liquidationPrice: "0.9", leverage: "10", isolatedMargin: "10",
};

describe("fetchAsterPosition", () => {
  it("calls the V3 signed endpoint and returns the matching symbol snapshot", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/fapi/v3/positionRisk");
      expect(String(url)).toContain("signature=");
      expect(String(url)).toContain(`signer=${ACCT.address}`);
      expect(String(url)).toContain("symbol=ANSEMUSDT");
      return { ok: true, json: async () => [ROW] } as Response;
    }) as unknown as typeof fetch;
    const s = await fetchAsterPosition(creds, "ANSEMUSDT", { fetchImpl, nowMs: 1000, timestamp: "2026-06-29T00:00:00.000Z" });
    expect(s.symbol).toBe("ANSEMUSDT");
    expect(s.sizeUsd).toBe(120);
  });
  it("throws on non-OK", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 } as Response)) as unknown as typeof fetch;
    await expect(fetchAsterPosition(creds, "ANSEMUSDT", { fetchImpl, nowMs: 1000 })).rejects.toThrow(/401/);
  });
  it("throws when no matching symbol in response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [{ ...ROW, symbol: "BTCUSDT" }] } as Response)) as unknown as typeof fetch;
    await expect(
      fetchAsterPosition(creds, "ANSEMUSDT", { fetchImpl, nowMs: 1000 }),
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
  it("parses USDT wallet/available balance from /fapi/v3/balance", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/fapi/v3/balance");
      expect(String(url)).toContain("signature=");
      return new Response(
        JSON.stringify([
          { asset: "BNB", balance: "1", availableBalance: "1" },
          { asset: "USDT", balance: "1234.50", availableBalance: "1000.00" },
        ]),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await fetchAccountBalance(creds, { fetchImpl, nowMs: 1000, timestamp: "2026-06-29T00:00:00.000Z" });
    expect(out).toEqual({ walletBalance: 1234.5, availableBalance: 1000, timestamp: "2026-06-29T00:00:00.000Z" });
  });

  it("throws on non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchAccountBalance(creds, { fetchImpl })).rejects.toThrow("AsterDex error: 401");
  });
});

describe("recentPriceMove", () => {
  const klines = [
    [0, "100", "102", "99", "101"],
    [0, "101", "105", "100", "104"],
  ];
  it("computes range pct move and last close", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("https://fapi.asterdex.com/fapi/v1/klines");
      expect(String(url)).not.toContain("fapi3.");
      expect(String(url)).toContain("interval=1m");
      expect(String(url)).toContain("limit=5");
      return new Response(JSON.stringify(klines), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await recentPriceMove(creds, "ANSEMUSDT", 5, { fetchImpl });
    expect(out.pctMove).toBeCloseTo(6.0606, 3);
    expect(out.lastPrice).toBe(104);
  });
  it("throws on non-ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(recentPriceMove(creds, "S", 5, { fetchImpl })).rejects.toThrow("AsterDex error: 500");
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
      expect(String(url)).toContain("https://fapi.asterdex.com/fapi/v1/exchangeInfo");
      expect(String(url)).not.toContain("fapi3.");
      return new Response(JSON.stringify(info), { status: 200 });
    }) as unknown as typeof fetch;
    const step = await getSymbolStep(creds, "ANSEMUSDT", { fetchImpl });
    expect(step).toBe(0.001);
  });
  it("throws when the symbol is absent", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ symbols: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(getSymbolStep(creds, "ANSEMUSDT", { fetchImpl })).rejects.toThrow("no LOT_SIZE step for ANSEMUSDT");
  });
});

describe("setLeverage", () => {
  it("POSTs a signed V3 leverage request", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String(url)).toContain("/fapi/v3/leverage");
      expect(String(url)).toContain("symbol=ANSEMUSDT");
      expect(String(url)).toContain("leverage=10");
      expect(String(url)).toContain("signature=");
      return new Response(JSON.stringify({ leverage: 10, symbol: "ANSEMUSDT" }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(setLeverage(creds, "ANSEMUSDT", 10, { fetchImpl, nowMs: 1 })).resolves.toBeUndefined();
  });
  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(setLeverage(creds, "ANSEMUSDT", 10, { fetchImpl, nowMs: 1 })).rejects.toThrow("AsterDex leverage error: 500");
  });
});

describe("openOrAddLong", () => {
  it("POSTs a signed V3 market BUY and returns orderId/status", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(String(url)).toContain("/fapi/v3/order");
      expect(String(url)).toContain("side=BUY");
      expect(String(url)).toContain("type=MARKET");
      expect(String(url)).toContain("quantity=12.5");
      return new Response(JSON.stringify({ orderId: 777, status: "NEW" }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await openOrAddLong(creds, { symbol: "ANSEMUSDT", quantity: 12.5 }, { fetchImpl, nowMs: 1 });
    expect(out).toEqual({ orderId: 777, status: "NEW" });
  });
  it("throws on a rejected order", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: -2019, msg: "Margin is insufficient." }), { status: 400 })) as unknown as typeof fetch;
    await expect(openOrAddLong(creds, { symbol: "S", quantity: 1 }, { fetchImpl, nowMs: 1 })).rejects.toThrow("AsterDex order error: 400");
  });
});
