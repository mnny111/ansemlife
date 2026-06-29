# AnsemLife Auto-Deploy to Long — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every minute, detect new USDT deposited into the AsterDex account and automatically deploy ~95% of it into a 10x long (opening it the first time, adding to it thereafter), and display the live Aster account balance on the site.

**Architecture:** A CRON_SECRET-guarded route (`/api/cron/deploy`) runs every minute. It reads the account's free balance with a new **TRADE-permission** key, aborts on a sharp recent price move (price guard) or below-threshold balance, sizes a market BUY against the symbol's step size, sets 10x leverage, places the order, then records a position snapshot. A KV NX-lock prevents overlapping ticks from double-ordering. The existing **read-only** key continues to power public display, now including a new `/api/balance` route. Two keys = least privilege.

**Tech Stack:** Next.js App Router (route handlers), TypeScript, Zod, `@vercel/kv`, Vitest. Binance-Futures-style API (`X-MBX-APIKEY` + HMAC-SHA256) against `https://fapi.asterdex.com`.

## Global Constraints

- **Immutability:** never mutate inputs; return new objects/arrays.
- **No `any`:** use `unknown` + Zod narrowing at boundaries.
- **Explicit types on exported functions.**
- **No `console.log`** in production code.
- **Two keys, separated:** read-only key (`ASTER_API_KEY`/`ASTER_API_SECRET`) for public/display routes only; TRADE key (`ASTER_TRADE_API_KEY`/`ASTER_TRADE_API_SECRET`) read **only** inside `/api/cron/deploy`. The TRADE key must never be referenced by `/api/balance` or `/api/position`.
- **Deploy tunables (constants, env-overridable):** `LEVERAGE=10`, `DEPLOY_FRACTION=0.95`, `MIN_DEPLOY_USD=10`, `PRICE_GUARD_PCT=3`, `PRICE_GUARD_WINDOW_MIN=5`.
- **Signing:** reuse existing `signQuery(params, secret)` for all signed GET/POST; signed POST sends params as the URL query string with an empty body and `X-MBX-APIKEY` header.
- **Cadence dependency:** every-minute cron requires **Vercel Pro** (Hobby = once/day).
- **Tests:** Vitest, mock `fetch` via injected `fetchImpl`; target 80%+ coverage, matching the existing suite style in `lib/aster.test.ts`.

---

## File Structure

**New**
- `app/api/cron/deploy/route.ts` — auto-deploy cron (CRON_SECRET-guarded).
- `app/api/balance/route.ts` — account balance for display (read-only key).
- `lib/aster.test.ts` additions + new route tests.

**Modified**
- `lib/constants.ts` — deploy tunables.
- `lib/config.ts` — `loadTradeConfig`.
- `lib/aster.ts` — `roundToStep`, `computeDeployQty`, `fetchAccountBalance`, `recentPriceMove`, `getSymbolStep`, `setLeverage`, `openOrAddLong`, types `AccountBalance`/`PriceMove`.
- `lib/store.ts` — `acquireLock`; `KvLike.setNx`.
- `lib/kv.ts` — implement `setNx` via `@vercel/kv` `{ nx, px }`.
- `app/dashboard/page.tsx` — fetch `/api/balance`, render a "Deposited" StatCard.
- `.env.example` — document TRADE key vars.
- `vercel.json` — add the every-minute deploy cron.

---

## Task 1: Deploy constants

**Files:**
- Modify: `lib/constants.ts`
- Modify: `.env.example`
- Test: `lib/constants.test.ts` (create)

**Interfaces:**
- Produces: `LEVERAGE: number`, `DEPLOY_FRACTION: number`, `MIN_DEPLOY_USD: number`, `PRICE_GUARD_PCT: number`, `PRICE_GUARD_WINDOW_MIN: number`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/constants.test.ts
import { describe, it, expect } from "vitest";
import { LEVERAGE, DEPLOY_FRACTION, MIN_DEPLOY_USD, PRICE_GUARD_PCT, PRICE_GUARD_WINDOW_MIN } from "./constants";

describe("deploy constants", () => {
  it("has the agreed defaults", () => {
    expect(LEVERAGE).toBe(10);
    expect(DEPLOY_FRACTION).toBe(0.95);
    expect(MIN_DEPLOY_USD).toBe(10);
    expect(PRICE_GUARD_PCT).toBe(3);
    expect(PRICE_GUARD_WINDOW_MIN).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/constants.test.ts`
Expected: FAIL (exports not defined)

- [ ] **Step 3: Add constants**

Append to `lib/constants.ts`:

```ts
// Auto-deploy tunables. Env overrides allow tuning without a redeploy.
const num = (envKey: string, fallback: number): number => {
  const v = process.env[envKey];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const LEVERAGE = num("DEPLOY_LEVERAGE", 10);
export const DEPLOY_FRACTION = num("DEPLOY_FRACTION", 0.95);
export const MIN_DEPLOY_USD = num("MIN_DEPLOY_USD", 10);
export const PRICE_GUARD_PCT = num("PRICE_GUARD_PCT", 3);
export const PRICE_GUARD_WINDOW_MIN = num("PRICE_GUARD_WINDOW_MIN", 5);
```

- [ ] **Step 4: Document env vars**

Append to `.env.example`:

```
# Auto-deploy (TRADE permission key — used ONLY by /api/cron/deploy)
ASTER_TRADE_API_KEY=
ASTER_TRADE_API_SECRET=
# Optional deploy tuning (defaults shown)
DEPLOY_LEVERAGE=10
DEPLOY_FRACTION=0.95
MIN_DEPLOY_USD=10
PRICE_GUARD_PCT=3
PRICE_GUARD_WINDOW_MIN=5
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/constants.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/constants.ts lib/constants.test.ts .env.example
git commit -m "feat: add auto-deploy constants and TRADE key env vars"
```

---

## Task 2: Order-sizing pure helpers

**Files:**
- Modify: `lib/aster.ts`
- Test: `lib/aster.test.ts`

**Interfaces:**
- Produces:
  - `roundToStep(qty: number, step: number): number` — floors `qty` down to a multiple of `step`.
  - `computeDeployQty(args: { availableBalance: number; deployFraction: number; leverage: number; markPrice: number; step: number }): number` — notional/markPrice, floored to step.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/aster.test.ts
import { roundToStep, computeDeployQty } from "./aster";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aster.test.ts`
Expected: FAIL (not exported)

- [ ] **Step 3: Implement helpers**

Add to `lib/aster.ts`:

```ts
export function roundToStep(qty: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(qty)) return 0;
  const multiples = Math.floor(qty / step + 1e-9);
  return Number((multiples * step).toFixed(8));
}

export function computeDeployQty(args: {
  availableBalance: number;
  deployFraction: number;
  leverage: number;
  markPrice: number;
  step: number;
}): number {
  const { availableBalance, deployFraction, leverage, markPrice, step } = args;
  if (!(markPrice > 0) || !(availableBalance > 0)) return 0;
  const notional = availableBalance * deployFraction * leverage;
  return roundToStep(notional / markPrice, step);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aster.ts lib/aster.test.ts
git commit -m "feat: add order-sizing helpers (roundToStep, computeDeployQty)"
```

---

## Task 3: `fetchAccountBalance`

**Files:**
- Modify: `lib/aster.ts`
- Test: `lib/aster.test.ts`

**Interfaces:**
- Consumes: `AsterCreds` (existing: `{ baseUrl; apiKey; apiSecret }`), `signQuery` (existing).
- Produces:
  - `type AccountBalance = { walletBalance: number; availableBalance: number; timestamp: string }`
  - `fetchAccountBalance(creds: AsterCreds, opts?: { fetchImpl?: typeof fetch; nowMs?: number; timestamp?: string }): Promise<AccountBalance>` — signed `GET /fapi/v2/account`, reads `totalWalletBalance` + `availableBalance`.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/aster.test.ts
import { fetchAccountBalance } from "./aster";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aster.test.ts`
Expected: FAIL (not exported)

- [ ] **Step 3: Implement**

Add to `lib/aster.ts`:

```ts
export type AccountBalance = { walletBalance: number; availableBalance: number; timestamp: string };

const AccountSchema = z.object({
  totalWalletBalance: z.string(),
  availableBalance: z.string(),
});

export async function fetchAccountBalance(
  creds: AsterCreds,
  opts: { fetchImpl?: typeof fetch; nowMs?: number; timestamp?: string } = {},
): Promise<AccountBalance> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const timestamp = opts.timestamp ?? new Date(nowMs).toISOString();
  const query = signQuery({ timestamp: nowMs }, creds.apiSecret);
  const url = `${creds.baseUrl}/fapi/v2/account?${query}`;
  const res = await fetchImpl(url, { headers: { "X-MBX-APIKEY": creds.apiKey } });
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const parsed = AccountSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("AsterDex returned malformed account response");
  return {
    walletBalance: Number(parsed.data.totalWalletBalance),
    availableBalance: Number(parsed.data.availableBalance),
    timestamp,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aster.ts lib/aster.test.ts
git commit -m "feat: add fetchAccountBalance (signed /fapi/v2/account read)"
```

---

## Task 4: `recentPriceMove` (price guard input)

**Files:**
- Modify: `lib/aster.ts`
- Test: `lib/aster.test.ts`

**Interfaces:**
- Produces:
  - `type PriceMove = { pctMove: number; lastPrice: number }`
  - `recentPriceMove(creds: AsterCreds, symbol: string, windowMin: number, opts?: { fetchImpl?: typeof fetch }): Promise<PriceMove>` — `GET /fapi/v1/klines?interval=1m&limit=windowMin`; `pctMove = (high-low)/low*100` over the window; `lastPrice` = last candle close.

Kline array layout (Binance/Aster): `[openTime, open, high, low, close, ...]` — high=index 2, low=index 3, close=index 4, all strings.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/aster.test.ts
import { recentPriceMove } from "./aster";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aster.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Add to `lib/aster.ts`:

```ts
export type PriceMove = { pctMove: number; lastPrice: number };

const KlineSchema = z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string()]).rest(z.unknown()));

export async function recentPriceMove(
  creds: AsterCreds,
  symbol: string,
  windowMin: number,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<PriceMove> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${creds.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=${windowMin}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const parsed = KlineSchema.safeParse(await res.json());
  if (!parsed.success || parsed.data.length === 0) throw new Error("AsterDex returned malformed klines response");
  const highs = parsed.data.map((k) => Number(k[2]));
  const lows = parsed.data.map((k) => Number(k[3]));
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const lastPrice = Number(parsed.data[parsed.data.length - 1][4]);
  const pctMove = low > 0 ? ((high - low) / low) * 100 : 0;
  return { pctMove, lastPrice };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aster.ts lib/aster.test.ts
git commit -m "feat: add recentPriceMove for the deploy price guard"
```

---

## Task 5: `getSymbolStep`

**Files:**
- Modify: `lib/aster.ts`
- Test: `lib/aster.test.ts`

**Interfaces:**
- Produces: `getSymbolStep(creds: AsterCreds, symbol: string, opts?: { fetchImpl?: typeof fetch }): Promise<number>` — reads LOT_SIZE `stepSize` from `GET /fapi/v1/exchangeInfo`.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/aster.test.ts
import { getSymbolStep } from "./aster";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aster.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Add to `lib/aster.ts`:

```ts
const ExchangeInfoSchema = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      filters: z.array(z.object({ filterType: z.string(), stepSize: z.string().optional() })),
    }),
  ),
});

export async function getSymbolStep(
  creds: AsterCreds,
  symbol: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${creds.baseUrl}/fapi/v1/exchangeInfo`);
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const parsed = ExchangeInfoSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("AsterDex returned malformed exchangeInfo response");
  const sym = parsed.data.symbols.find((s) => s.symbol === symbol);
  const lot = sym?.filters.find((f) => f.filterType === "LOT_SIZE" && f.stepSize);
  if (!lot?.stepSize) throw new Error(`no LOT_SIZE step for ${symbol}`);
  return Number(lot.stepSize);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aster.ts lib/aster.test.ts
git commit -m "feat: add getSymbolStep from exchangeInfo LOT_SIZE"
```

---

## Task 6: `setLeverage` + `openOrAddLong` (signed POSTs)

**Files:**
- Modify: `lib/aster.ts`
- Test: `lib/aster.test.ts`

**Interfaces:**
- Produces:
  - `setLeverage(creds: AsterCreds, symbol: string, leverage: number, opts?: { fetchImpl?: typeof fetch; nowMs?: number }): Promise<void>` — signed `POST /fapi/v1/leverage`.
  - `openOrAddLong(creds: AsterCreds, args: { symbol: string; quantity: number }, opts?: { fetchImpl?: typeof fetch; nowMs?: number }): Promise<{ orderId: number; status: string }>` — signed `POST /fapi/v1/order` market BUY.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/aster.test.ts
import { setLeverage, openOrAddLong } from "./aster";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aster.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Add to `lib/aster.ts`:

```ts
async function signedPost(
  creds: AsterCreds,
  path: string,
  params: Record<string, string | number>,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<Response> {
  const query = signQuery({ ...params, timestamp: nowMs }, creds.apiSecret);
  return fetchImpl(`${creds.baseUrl}${path}?${query}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });
}

export async function setLeverage(
  creds: AsterCreds,
  symbol: string,
  leverage: number,
  opts: { fetchImpl?: typeof fetch; nowMs?: number } = {},
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const res = await signedPost(creds, "/fapi/v1/leverage", { symbol, leverage }, fetchImpl, nowMs);
  if (!res.ok) throw new Error(`AsterDex leverage error: ${res.status}`);
}

const OrderResultSchema = z.object({ orderId: z.number(), status: z.string() });

export async function openOrAddLong(
  creds: AsterCreds,
  args: { symbol: string; quantity: number },
  opts: { fetchImpl?: typeof fetch; nowMs?: number } = {},
): Promise<{ orderId: number; status: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const res = await signedPost(
    creds,
    "/fapi/v1/order",
    { symbol: args.symbol, side: "BUY", type: "MARKET", quantity: args.quantity },
    fetchImpl,
    nowMs,
  );
  if (!res.ok) throw new Error(`AsterDex order error: ${res.status}`);
  const parsed = OrderResultSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("AsterDex returned malformed order response");
  return parsed.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/aster.ts lib/aster.test.ts
git commit -m "feat: add setLeverage and openOrAddLong signed POSTs"
```

---

## Task 7: `loadTradeConfig`

**Files:**
- Modify: `lib/config.ts`
- Test: `lib/config.test.ts`

**Interfaces:**
- Produces:
  - `type TradeConfig = { tradeApiKey: string; tradeApiSecret: string }`
  - `loadTradeConfig(env: Record<string, string | undefined>): TradeConfig` — reads `ASTER_TRADE_API_KEY`/`ASTER_TRADE_API_SECRET`, throws listing any missing. Independent of `loadConfig` so display routes never require the TRADE key.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/config.test.ts
import { loadTradeConfig } from "./config";

describe("loadTradeConfig", () => {
  it("loads the trade key pair", () => {
    expect(loadTradeConfig({ ASTER_TRADE_API_KEY: "k", ASTER_TRADE_API_SECRET: "s" })).toEqual({
      tradeApiKey: "k",
      tradeApiSecret: "s",
    });
  });
  it("throws listing missing vars", () => {
    expect(() => loadTradeConfig({})).toThrow(/ASTER_TRADE_API_KEY/);
    expect(() => loadTradeConfig({ ASTER_TRADE_API_KEY: "k" })).toThrow(/ASTER_TRADE_API_SECRET/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Append to `lib/config.ts`:

```ts
export type TradeConfig = { tradeApiKey: string; tradeApiSecret: string };

const TRADE_KEYS: Record<keyof TradeConfig, string> = {
  tradeApiKey: "ASTER_TRADE_API_KEY",
  tradeApiSecret: "ASTER_TRADE_API_SECRET",
};

export function loadTradeConfig(env: Record<string, string | undefined>): TradeConfig {
  const missing: string[] = [];
  const out = {} as TradeConfig;
  for (const [field, envKey] of Object.entries(TRADE_KEYS) as [keyof TradeConfig, string][]) {
    const v = env[envKey];
    if (!v) missing.push(envKey);
    else out[field] = v;
  }
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat: add loadTradeConfig (separate TRADE key loader)"
```

---

## Task 8: KV NX-lock support

**Files:**
- Modify: `lib/store.ts`, `lib/kv.ts`
- Test: `lib/store.test.ts`

**Interfaces:**
- Consumes: existing `KvLike`.
- Produces:
  - `KvLike.setNx(key: string, value: unknown, ttlMs: number): Promise<boolean>` — set only if absent, with TTL; resolves `true` on acquire.
  - `acquireLock(kv: KvLike, key: string, ttlMs: number): Promise<boolean>` (in `store.ts`).
- Note: existing `KvLike` consumers (`getHistory`/`appendSnapshot`) only use `get`/`set`; adding `setNx` is additive. Update the `vercelKv` literal so it still satisfies `KvLike`.

- [ ] **Step 1: Write the failing test**

```ts
// add to lib/store.test.ts
import { acquireLock } from "./store";

describe("acquireLock", () => {
  it("returns true when the lock is free, false when held", async () => {
    const store = new Map<string, unknown>();
    const kv = {
      get: async <T>(k: string) => (store.has(k) ? (store.get(k) as T) : null),
      set: async (k: string, v: unknown) => store.set(k, v),
      setNx: async (k: string, v: unknown) => {
        if (store.has(k)) return false;
        store.set(k, v);
        return true;
      },
    };
    expect(await acquireLock(kv, "lock", 1000)).toBe(true);
    expect(await acquireLock(kv, "lock", 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL (acquireLock not exported; `setNx` missing from `KvLike`)

- [ ] **Step 3: Implement**

In `lib/store.ts`, extend the type and add the helper:

```ts
export type KvLike = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  setNx(key: string, value: unknown, ttlMs: number): Promise<boolean>;
};

// Best-effort distributed lock. TTL auto-expires so a crashed run cannot wedge.
export async function acquireLock(kv: KvLike, key: string, ttlMs: number): Promise<boolean> {
  return kv.setNx(key, "1", ttlMs);
}
```

In `lib/kv.ts`, implement `setNx` via `@vercel/kv` options:

```ts
import { kv } from "@vercel/kv";
import type { KvLike } from "./store";

export const vercelKv: KvLike = {
  get: <T>(key: string) => kv.get<T>(key),
  set: (key, value) => kv.set(key, value),
  setNx: async (key, value, ttlMs) => (await kv.set(key, value, { nx: true, px: ttlMs })) === "OK",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts lib/kv.ts lib/store.test.ts
git commit -m "feat: add KV NX-lock (setNx + acquireLock)"
```

---

## Task 9: `/api/balance` display route

**Files:**
- Create: `app/api/balance/route.ts`
- Test: `app/api/balance/route.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (read-only key), `fetchAccountBalance`.
- Produces: `GET` → `{ walletBalance, availableBalance, timestamp }` (200) or `{ error }` (502). Uses the **read-only** key only.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/balance/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  loadConfig: () => ({ asterBaseUrl: "https://x", asterApiKey: "ro", asterApiSecret: "s" }),
}));
const fetchAccountBalance = vi.fn();
vi.mock("@/lib/aster", () => ({ fetchAccountBalance: (...a: unknown[]) => fetchAccountBalance(...a) }));

import { GET } from "./route";

describe("GET /api/balance", () => {
  beforeEach(() => fetchAccountBalance.mockReset());

  it("returns the normalized balance", async () => {
    fetchAccountBalance.mockResolvedValue({ walletBalance: 1000, availableBalance: 250, timestamp: "2026-06-29T00:00:00.000Z" });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ walletBalance: 1000, availableBalance: 250, timestamp: "2026-06-29T00:00:00.000Z" });
  });

  it("returns 502 on a read failure", async () => {
    fetchAccountBalance.mockRejectedValue(new Error("AsterDex error: 401"));
    const res = await GET();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "AsterDex error: 401" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/balance/route.test.ts`
Expected: FAIL (route missing)

- [ ] **Step 3: Implement**

```ts
// app/api/balance/route.ts
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { fetchAccountBalance } from "@/lib/aster";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = loadConfig(process.env);
    const balance = await fetchAccountBalance({
      baseUrl: cfg.asterBaseUrl,
      apiKey: cfg.asterApiKey,
      apiSecret: cfg.asterApiSecret,
    });
    return NextResponse.json(balance);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "balance read failed" }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/balance/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/balance/route.ts app/api/balance/route.test.ts
git commit -m "feat: add /api/balance display route (read-only key)"
```

---

## Task 10: `/api/cron/deploy` auto-deploy route

**Files:**
- Create: `app/api/cron/deploy/route.ts`
- Test: `app/api/cron/deploy/route.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `loadTradeConfig`, `verifyBearer`, `acquireLock`, `vercelKv`, `appendSnapshot`, and from `lib/aster`: `fetchAccountBalance`, `recentPriceMove`, `getSymbolStep`, `computeDeployQty`, `setLeverage`, `openOrAddLong`, `fetchAsterPosition`; constants from `lib/constants`.
- Produces: `GET`/`POST` → JSON. Outcomes: `401` (bad secret); `{ skipped: "locked" | "below-threshold" | "price-guard" | "qty-zero" }` (200); `{ ok: true, order, snapshot }` (200); `{ error }` (502).
- Control flow:
  1. `verifyBearer(authorization, cfg.cronSecret)` → else 401.
  2. `acquireLock(vercelKv, "ansemlife:deploy-lock", 50000)` → else `skipped: "locked"`. (Lock auto-expires < 60s cron interval; no explicit release needed.)
  3. `tradeCreds = { baseUrl: cfg.asterBaseUrl, apiKey: trade.tradeApiKey, apiSecret: trade.tradeApiSecret }`.
  4. `balance = fetchAccountBalance(tradeCreds)`; `availableBalance < MIN_DEPLOY_USD` → `skipped: "below-threshold"`.
  5. `move = recentPriceMove(tradeCreds, symbol, PRICE_GUARD_WINDOW_MIN)`; `move.pctMove > PRICE_GUARD_PCT` → `skipped: "price-guard"`.
  6. `step = getSymbolStep(tradeCreds, symbol)`; `qty = computeDeployQty({ availableBalance, deployFraction: DEPLOY_FRACTION, leverage: LEVERAGE, markPrice: move.lastPrice, step })`; `qty <= 0` → `skipped: "qty-zero"`.
  7. `setLeverage(tradeCreds, symbol, LEVERAGE)`; `order = openOrAddLong(tradeCreds, { symbol, quantity: qty })`.
  8. `snapshot = fetchAsterPosition(readOnlyCreds, symbol)`; `appendSnapshot(vercelKv, snapshot)`. Return `{ ok: true, order, snapshot }`.
  - Any throw after auth → 502 `{ error }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/cron/deploy/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg = { asterBaseUrl: "https://x", asterApiKey: "ro", asterApiSecret: "ros", asterSymbol: "ANSEMUSDT", cronSecret: "secret" };
vi.mock("@/lib/config", () => ({
  loadConfig: () => cfg,
  loadTradeConfig: () => ({ tradeApiKey: "trd", tradeApiSecret: "trs" }),
}));
const m = {
  acquireLock: vi.fn(),
  appendSnapshot: vi.fn(async () => []),
  fetchAccountBalance: vi.fn(),
  recentPriceMove: vi.fn(),
  getSymbolStep: vi.fn(),
  setLeverage: vi.fn(async () => undefined),
  openOrAddLong: vi.fn(),
  fetchAsterPosition: vi.fn(),
};
vi.mock("@/lib/store", () => ({ acquireLock: (...a: unknown[]) => m.acquireLock(...a) }));
vi.mock("@/lib/kv", () => ({ vercelKv: {} }));
vi.mock("@/lib/aster", () => ({
  fetchAccountBalance: (...a: unknown[]) => m.fetchAccountBalance(...a),
  recentPriceMove: (...a: unknown[]) => m.recentPriceMove(...a),
  getSymbolStep: (...a: unknown[]) => m.getSymbolStep(...a),
  computeDeployQty: (args: { availableBalance: number; markPrice: number; step: number; leverage: number; deployFraction: number }) =>
    Math.floor((args.availableBalance * args.deployFraction * args.leverage) / args.markPrice / args.step) * args.step,
  setLeverage: (...a: unknown[]) => m.setLeverage(...a),
  openOrAddLong: (...a: unknown[]) => m.openOrAddLong(...a),
  fetchAsterPosition: (...a: unknown[]) => m.fetchAsterPosition(...a),
}));
import { appendSnapshot } from "@/lib/store"; // not used; ensures path resolves
void appendSnapshot;
vi.mock("@/lib/store", async () => ({
  acquireLock: (...a: unknown[]) => m.acquireLock(...a),
  appendSnapshot: (...a: unknown[]) => m.appendSnapshot(...a),
}));

import { GET } from "./route";

const auth = (token: string | null) =>
  new Request("https://x/api/cron/deploy", { headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeEach(() => Object.values(m).forEach((fn) => fn.mockReset?.()));

describe("GET /api/cron/deploy", () => {
  it("401s on a bad secret", async () => {
    const res = await GET(auth("wrong"));
    expect(res.status).toBe(401);
  });

  it("skips when the lock is held", async () => {
    m.acquireLock.mockResolvedValue(false);
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "locked" });
  });

  it("skips below threshold", async () => {
    m.acquireLock.mockResolvedValue(true);
    m.fetchAccountBalance.mockResolvedValue({ availableBalance: 5, walletBalance: 5, timestamp: "t" });
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "below-threshold" });
  });

  it("skips on the price guard", async () => {
    m.acquireLock.mockResolvedValue(true);
    m.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    m.recentPriceMove.mockResolvedValue({ pctMove: 9, lastPrice: 2 });
    const res = await GET(auth("secret"));
    expect(await res.json()).toEqual({ skipped: "price-guard" });
  });

  it("deploys on the happy path", async () => {
    m.acquireLock.mockResolvedValue(true);
    m.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    m.recentPriceMove.mockResolvedValue({ pctMove: 1, lastPrice: 2 });
    m.getSymbolStep.mockResolvedValue(0.1);
    m.openOrAddLong.mockResolvedValue({ orderId: 1, status: "NEW" });
    m.fetchAsterPosition.mockResolvedValue({ symbol: "ANSEMUSDT", status: "open", side: "long" });
    const res = await GET(auth("secret"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.order).toEqual({ orderId: 1, status: "NEW" });
    expect(m.setLeverage).toHaveBeenCalled();
    expect(m.openOrAddLong).toHaveBeenCalledWith(
      { baseUrl: "https://x", apiKey: "trd", apiSecret: "trs" },
      { symbol: "ANSEMUSDT", quantity: 475 }, // 100*0.95*10/2=475, step 0.1
    );
    expect(m.appendSnapshot).toHaveBeenCalled();
  });

  it("502s on an order failure", async () => {
    m.acquireLock.mockResolvedValue(true);
    m.fetchAccountBalance.mockResolvedValue({ availableBalance: 100, walletBalance: 100, timestamp: "t" });
    m.recentPriceMove.mockResolvedValue({ pctMove: 1, lastPrice: 2 });
    m.getSymbolStep.mockResolvedValue(0.1);
    m.openOrAddLong.mockRejectedValue(new Error("AsterDex order error: 400"));
    const res = await GET(auth("secret"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AsterDex order error: 400" });
  });
});
```

> Note: remove the throwaway `import { appendSnapshot }` / `void appendSnapshot` lines and the duplicate `vi.mock("@/lib/store", ...)`; keep only the second `vi.mock("@/lib/store", ...)` that exports both `acquireLock` and `appendSnapshot`. (They are shown above only to make the resolved exports explicit.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cron/deploy/route.test.ts`
Expected: FAIL (route missing)

- [ ] **Step 3: Implement**

```ts
// app/api/cron/deploy/route.ts
import { NextResponse } from "next/server";
import { loadConfig, loadTradeConfig } from "@/lib/config";
import { vercelKv } from "@/lib/kv";
import { acquireLock, appendSnapshot } from "@/lib/store";
import { verifyBearer } from "@/lib/auth";
import {
  fetchAccountBalance,
  recentPriceMove,
  getSymbolStep,
  computeDeployQty,
  setLeverage,
  openOrAddLong,
  fetchAsterPosition,
} from "@/lib/aster";
import { LEVERAGE, DEPLOY_FRACTION, MIN_DEPLOY_USD, PRICE_GUARD_PCT, PRICE_GUARD_WINDOW_MIN } from "@/lib/constants";

const LOCK_KEY = "ansemlife:deploy-lock";
const LOCK_TTL_MS = 50_000;

async function runDeploy(req: Request): Promise<Response> {
  const cfg = loadConfig(process.env);
  if (!verifyBearer(req.headers.get("authorization"), cfg.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const locked = await acquireLock(vercelKv, LOCK_KEY, LOCK_TTL_MS);
    if (!locked) return NextResponse.json({ skipped: "locked" });

    const trade = loadTradeConfig(process.env);
    const tradeCreds = { baseUrl: cfg.asterBaseUrl, apiKey: trade.tradeApiKey, apiSecret: trade.tradeApiSecret };
    const symbol = cfg.asterSymbol;

    const balance = await fetchAccountBalance(tradeCreds);
    if (balance.availableBalance < MIN_DEPLOY_USD) return NextResponse.json({ skipped: "below-threshold" });

    const move = await recentPriceMove(tradeCreds, symbol, PRICE_GUARD_WINDOW_MIN);
    if (move.pctMove > PRICE_GUARD_PCT) return NextResponse.json({ skipped: "price-guard" });

    const step = await getSymbolStep(tradeCreds, symbol);
    const quantity = computeDeployQty({
      availableBalance: balance.availableBalance,
      deployFraction: DEPLOY_FRACTION,
      leverage: LEVERAGE,
      markPrice: move.lastPrice,
      step,
    });
    if (quantity <= 0) return NextResponse.json({ skipped: "qty-zero" });

    await setLeverage(tradeCreds, symbol, LEVERAGE);
    const order = await openOrAddLong(tradeCreds, { symbol, quantity });

    const snapshot = await fetchAsterPosition(
      { baseUrl: cfg.asterBaseUrl, apiKey: cfg.asterApiKey, apiSecret: cfg.asterApiSecret },
      symbol,
    );
    await appendSnapshot(vercelKv, snapshot);

    return NextResponse.json({ ok: true, order, snapshot });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "deploy failed" }, { status: 502 });
  }
}

export async function GET(req: Request) {
  return runDeploy(req);
}

export async function POST(req: Request) {
  return runDeploy(req);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/cron/deploy/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/deploy/route.ts app/api/cron/deploy/route.test.ts
git commit -m "feat: add /api/cron/deploy auto-deploy route with lock + price guard"
```

---

## Task 11: Wire the cron + display the balance

**Files:**
- Modify: `vercel.json`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `/api/balance` (Task 9), `StatCard` (existing: props `{ label; value; sub? }`), `usd` (existing).

- [ ] **Step 1: Add the cron schedule**

Edit `vercel.json` to:

```json
{
  "crons": [
    { "path": "/api/cron/snapshot", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/deploy", "schedule": "* * * * *" }
  ]
}
```

- [ ] **Step 2: Extend the dashboard State type**

In `app/dashboard/page.tsx`, add to the `State` type:

```ts
  balance?: { walletBalance: number; availableBalance: number; timestamp: string; error?: string };
```

- [ ] **Step 3: Fetch `/api/balance`**

Replace the `Promise.allSettled([...])` block with:

```tsx
    Promise.allSettled([
      getJson("/api/rewards"),
      getJson("/api/price"),
      getJson("/api/position"),
      getJson("/api/balance"),
    ]).then(([rewardsResult, priceResult, positionResult, balanceResult]) => {
      setS({
        rewards: rewardsResult.status === "fulfilled" ? rewardsResult.value : undefined,
        price: priceResult.status === "fulfilled" ? priceResult.value : undefined,
        position: positionResult.status === "fulfilled" ? positionResult.value : undefined,
        balance: balanceResult.status === "fulfilled" ? balanceResult.value : undefined,
      });
    });
```

- [ ] **Step 4: Render the "Deposited" StatCard**

In the first `<section className="grid gap-4 sm:grid-cols-3">`, change it to `sm:grid-cols-4` and add as the first card:

```tsx
        <StatCard
          label="Deposited (Aster)"
          value={s.balance?.error ? "—" : usd(s.balance?.walletBalance ?? 0)}
          sub={s.balance && !s.balance.error ? `${usd(s.balance.availableBalance)} free` : undefined}
        />
```

- [ ] **Step 5: Verify the build and full suite**

Run: `npx vitest run && npx next build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add vercel.json app/dashboard/page.tsx
git commit -m "feat: every-minute deploy cron + Deposited balance stat on dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** §2 two-key separation → Tasks 7, 9, 10. §3 drain-balance detection → Task 10 (steps 2,4). §4 deploy logic → Tasks 2–6, 10. §5 display → Tasks 3, 9, 11. §6 constants → Task 1. §8 testing → every task is TDD. §9 cadence → Task 11 (cron `* * * * *`) + README note below.
- **README:** after Task 11, add a short "Auto-deploy" note to `README.md` documenting the TRADE key, the Vercel Pro requirement, and the price-guard/threshold behavior (fold into the Task 11 commit or a follow-up docs commit).
- **Hedge vs one-way mode (open question from spec review):** the `openOrAddLong` order omits `positionSide`, which works in **one-way** mode. If the Aster account is in **hedge** mode, add `positionSide: "LONG"` to the order params in Task 6. Confirm account mode before going live.
- **No placeholders / type consistency:** verified `AsterCreds`, `AccountBalance`, `PriceMove`, `computeDeployQty` arg shape, and route outcome strings are used identically across tasks.
```
