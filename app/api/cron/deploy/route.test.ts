import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  acquireLock: vi.fn(),
  appendSnapshot: vi.fn(async () => []),
  fetchAccountBalance: vi.fn(),
  recentPriceMove: vi.fn(),
  getSymbolStep: vi.fn(),
  setLeverage: vi.fn(async () => undefined),
  openOrAddLong: vi.fn(),
  fetchAsterPosition: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  loadConfig: () => ({ asterBaseUrl: "https://x", asterUser: "0xuser", asterSigner: "0xro", asterPrivateKey: "0xros", asterSymbol: "ANSEMUSDT", cronSecret: "secret" }),
  loadTradeConfig: () => ({ tradeSigner: "0xtrd", tradePrivateKey: "0xtrs" }),
}));
vi.mock("@/lib/kv", () => ({ vercelKv: {} }));
vi.mock("@/lib/store", () => ({ acquireLock: h.acquireLock, appendSnapshot: h.appendSnapshot }));
vi.mock("@/lib/aster", () => ({
  fetchAccountBalance: h.fetchAccountBalance,
  recentPriceMove: h.recentPriceMove,
  getSymbolStep: h.getSymbolStep,
  computeDeployQty: (args: { availableBalance: number; deployFraction: number; leverage: number; markPrice: number; step: number }) =>
    Math.floor((args.availableBalance * args.deployFraction * args.leverage) / args.markPrice / args.step) * args.step,
  setLeverage: h.setLeverage,
  openOrAddLong: h.openOrAddLong,
  fetchAsterPosition: h.fetchAsterPosition,
}));

import { GET } from "./route";

const auth = (token: string | null) =>
  new Request("https://x/api/cron/deploy", { headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/deploy", () => {
  it("401s on a bad secret", async () => {
    const res = await GET(auth("wrong"));
    expect(res.status).toBe(401);
  });

  it("skips when the lock is held", async () => {
    h.acquireLock.mockResolvedValue(false);
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "locked" });
  });

  it("skips below threshold", async () => {
    h.acquireLock.mockResolvedValue(true);
    h.fetchAccountBalance.mockResolvedValue({ availableBalance: 5, walletBalance: 5, timestamp: "t" });
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "below-threshold" });
  });

  it("skips on the price guard", async () => {
    h.acquireLock.mockResolvedValue(true);
    h.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    h.recentPriceMove.mockResolvedValue({ pctMove: 9, lastPrice: 2 });
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "price-guard" });
  });

  it("deploys on the happy path", async () => {
    h.acquireLock.mockResolvedValue(true);
    h.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    h.recentPriceMove.mockResolvedValue({ pctMove: 1, lastPrice: 2 });
    h.getSymbolStep.mockResolvedValue(0.1);
    h.openOrAddLong.mockResolvedValue({ orderId: 1, status: "NEW" });
    h.fetchAsterPosition.mockResolvedValue({ symbol: "ANSEMUSDT", status: "open", side: "long" });
    const res = await GET(auth("secret"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.order).toEqual({ orderId: 1, status: "NEW" });
    expect(h.setLeverage).toHaveBeenCalled();
    expect(h.openOrAddLong).toHaveBeenCalledWith(
      { baseUrl: "https://x", user: "0xuser", signer: "0xtrd", privateKey: "0xtrs" },
      { symbol: "ANSEMUSDT", quantity: 475 },
    );
    expect(h.appendSnapshot).toHaveBeenCalled();
    expect(h.fetchAsterPosition).toHaveBeenCalledWith(
      { baseUrl: "https://x", user: "0xuser", signer: "0xro", privateKey: "0xros" },
      "ANSEMUSDT",
    );
  });

  it("skips when computed quantity rounds to zero", async () => {
    h.acquireLock.mockResolvedValue(true);
    h.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    h.recentPriceMove.mockResolvedValue({ pctMove: 1, lastPrice: 2 });
    h.getSymbolStep.mockResolvedValue(1000); // step so large the floored qty is 0
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "qty-zero" });
    expect(h.openOrAddLong).not.toHaveBeenCalled();
  });

  it("502s on an order failure", async () => {
    h.acquireLock.mockResolvedValue(true);
    h.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    h.recentPriceMove.mockResolvedValue({ pctMove: 1, lastPrice: 2 });
    h.getSymbolStep.mockResolvedValue(0.1);
    h.openOrAddLong.mockImplementation(async () => {
      throw new Error("AsterDex order error: 400");
    });
    const res = await GET(auth("secret"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AsterDex order error: 400" });
  });
});
