# AnsemLife Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js transparency dashboard ("AnsemLife") that proves and narrates that creator rewards from a pump.fun coin are deployed into a 10x long on a target token, reading the **live position automatically from AsterDex via a read-only API key**, plus on-chain reward reads and target-token price.

**Architecture:** Single Next.js (App Router, TypeScript) full-stack app. Public landing + dashboard read from internal API routes. API routes read: Solana reward-wallet inflows via RPC, target-token price via DexScreener, and the live 10x position from AsterDex (`GET /fapi/v2/positionRisk`, HMAC-signed, **read-only key — no TRADE permission**). A cron-secret-protected route appends position snapshots to Vercel KV for the history/liquidation log. Pure logic (config, signing, normalization, validation, aggregation, auth) lives in framework-free `lib/` modules so it is unit-testable; no order placement anywhere.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, React, Tailwind CSS, Vitest + React Testing Library, Zod (validation), `@vercel/kv` (storage), `@solana/web3.js` (RPC reads), DexScreener + AsterDex public HTTP APIs, Node `crypto` (HMAC). Deploy: Vercel.

## Global Constraints

- Language: TypeScript, `strict: true`. No `any` in committed `lib/` code (page-boundary JSON glue may use `any` with a comment).
- Immutability: never mutate objects/arrays in place — return new copies. Snapshot history is append-only.
- File size: target 200–400 lines, 800 max. Many small focused files.
- Error handling: validate all external data (env, RPC, DexScreener, AsterDex) with Zod before use; fail fast with clear messages; never silently swallow errors. External-read failures return last-good value + a staleness flag, never a crash.
- Secrets: only via env vars (`SOLANA_RPC_URL`, `REWARD_WALLET_ADDRESS`, `TARGET_TOKEN_PAIR`, `ANSEMLIFE_COIN_MINT`, `ASTER_BASE_URL`, `ASTER_API_KEY`, `ASTER_API_SECRET`, `ASTER_SYMBOL`, `CRON_SECRET`, `KV_*`). Never hardcode.
- AsterDex key is **read-only** (no TRADE permission). The site never places, modifies, or cancels an order.
- Cron auth: constant-time bearer-token compare against `CRON_SECRET`.
- Testing: TDD (test first, watch it fail, implement, watch it pass, commit). Target 80%+ coverage on `lib/` logic. No network in tests — inject `fetch`/balance/timestamp.
- Risk disclaimer copy (verbatim, must appear on landing + near dashboard position block):
  > **Not financial advice.** AnsemLife uses 10x leverage — a roughly 9–10% adverse price move can liquidate the entire position to zero. Creator rewards are variable and not guaranteed. You can lose money. Position data is read live from AsterDex; AsterDex is the source of truth, not a guarantee of outcome.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `.env.example`
- Modify: `.gitignore` (already exists)

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable Next.js app and a working `npm test` command other tasks depend on.

- [ ] **Step 1: Initialize package and dependencies**

Run:
```bash
npm init -y
npm install next@latest react@latest react-dom@latest @vercel/kv @solana/web3.js zod
npm install -D typescript @types/react @types/node @types/react-dom tailwindcss postcss autoprefixer vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

`vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Add minimal app shell**

`app/layout.tsx`:
```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "AnsemLife", description: "Creator rewards, deployed into a 10x long on AsterDex." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen">{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl font-bold">AnsemLife</h1></main>;
}
```

`.env.example`:
```bash
ANSEMLIFE_COIN_MINT=
REWARD_WALLET_ADDRESS=
TARGET_TOKEN_PAIR=
SOLANA_RPC_URL=
ASTER_BASE_URL=https://fapi.asterdex.com
ASTER_API_KEY=
ASTER_API_SECRET=
ASTER_SYMBOL=
CRON_SECRET=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 4: Add scripts to package.json**

Set `"scripts"` to:
```json
{ "dev": "next dev", "build": "next build", "start": "next start", "test": "vitest run", "test:watch": "vitest" }
```

- [ ] **Step 5: Verify build and test wiring**

Run: `npm run build`
Expected: build succeeds (compiles `/` route).
Run: `npm test`
Expected: "No test files found" (exit 0) — runner works.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Vitest + Tailwind"
```

---

### Task 2: Environment config loader

**Files:**
- Create: `lib/config.ts`, `lib/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadConfig(env: Record<string, string | undefined>): AppConfig` — throws `Error` listing all missing required keys.
  - `type AppConfig = { coinMint: string; rewardWallet: string; targetTokenPair: string; solanaRpcUrl: string; asterBaseUrl: string; asterApiKey: string; asterApiSecret: string; asterSymbol: string; cronSecret: string; kvUrl: string; kvToken: string }`

- [ ] **Step 1: Write the failing test**

`lib/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const full = {
  ANSEMLIFE_COIN_MINT: "mint", REWARD_WALLET_ADDRESS: "wallet",
  TARGET_TOKEN_PAIR: "pair", SOLANA_RPC_URL: "https://rpc",
  ASTER_BASE_URL: "https://fapi.asterdex.com", ASTER_API_KEY: "ak",
  ASTER_API_SECRET: "sk", ASTER_SYMBOL: "ANSEMUSDT", CRON_SECRET: "cs",
  KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "tok",
};

describe("loadConfig", () => {
  it("maps env to AppConfig", () => {
    const cfg = loadConfig(full);
    expect(cfg.rewardWallet).toBe("wallet");
    expect(cfg.asterSymbol).toBe("ANSEMUSDT");
    expect(cfg.cronSecret).toBe("cs");
  });
  it("throws listing every missing key", () => {
    expect(() => loadConfig({})).toThrow(/ANSEMLIFE_COIN_MINT/);
    expect(() => loadConfig({ ...full, ASTER_API_SECRET: "" })).toThrow(/ASTER_API_SECRET/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write minimal implementation**

`lib/config.ts`:
```ts
export type AppConfig = {
  coinMint: string; rewardWallet: string; targetTokenPair: string; solanaRpcUrl: string;
  asterBaseUrl: string; asterApiKey: string; asterApiSecret: string; asterSymbol: string;
  cronSecret: string; kvUrl: string; kvToken: string;
};

const KEYS: Record<keyof AppConfig, string> = {
  coinMint: "ANSEMLIFE_COIN_MINT", rewardWallet: "REWARD_WALLET_ADDRESS",
  targetTokenPair: "TARGET_TOKEN_PAIR", solanaRpcUrl: "SOLANA_RPC_URL",
  asterBaseUrl: "ASTER_BASE_URL", asterApiKey: "ASTER_API_KEY",
  asterApiSecret: "ASTER_API_SECRET", asterSymbol: "ASTER_SYMBOL",
  cronSecret: "CRON_SECRET", kvUrl: "KV_REST_API_URL", kvToken: "KV_REST_API_TOKEN",
};

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const missing: string[] = [];
  const out = {} as AppConfig;
  for (const [field, envKey] of Object.entries(KEYS) as [keyof AppConfig, string][]) {
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
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat: env config loader with fail-fast validation"
```

---

### Task 3: Position snapshot model + summary math

**Files:**
- Create: `lib/position.ts`, `lib/position.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PositionSnapshot = { timestamp: string; symbol: string; status: "open" | "closed"; side: "long" | "short" | "flat"; leverage: number; entryPrice: number; sizeUsd: number; marginUsd: number; liquidationPrice: number; unrealizedPnlUsd: number }`
  - `PositionSnapshotSchema` (Zod) validating the above.
  - `summarize(history: PositionSnapshot[]): { latest: PositionSnapshot | null; deployedTotalUsd: number; liquidatedCount: number; survivedCount: number }` — `deployedTotalUsd` = sum of `marginUsd` over snapshots that are `open`; `liquidatedCount` = transitions from `open` to `closed`; `survivedCount` = count of `open` snapshots.

- [ ] **Step 1: Write the failing test**

`lib/position.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PositionSnapshotSchema, summarize, type PositionSnapshot } from "./position";

const snap = (over: Partial<PositionSnapshot>): PositionSnapshot => ({
  timestamp: "2026-06-29T00:00:00.000Z", symbol: "ANSEMUSDT", status: "open", side: "long",
  leverage: 10, entryPrice: 1, sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9,
  unrealizedPnlUsd: 0, ...over,
});

describe("PositionSnapshotSchema", () => {
  it("accepts a valid snapshot", () => {
    expect(PositionSnapshotSchema.safeParse(snap({})).success).toBe(true);
  });
  it("rejects negative leverage", () => {
    expect(PositionSnapshotSchema.safeParse(snap({ leverage: -1 })).success).toBe(false);
  });
});

describe("summarize", () => {
  it("zeroes for empty history", () => {
    expect(summarize([])).toEqual({ latest: null, deployedTotalUsd: 0, liquidatedCount: 0, survivedCount: 0 });
  });
  it("uses latest by timestamp, sums open margin, counts liquidations as open->closed transitions", () => {
    const a = snap({ timestamp: "2026-06-29T00:00:00.000Z", status: "open", marginUsd: 100 });
    const b = snap({ timestamp: "2026-06-30T00:00:00.000Z", status: "closed", side: "flat", marginUsd: 0 });
    const c = snap({ timestamp: "2026-07-01T00:00:00.000Z", status: "open", marginUsd: 250 });
    const s = summarize([a, b, c]);
    expect(s.latest?.timestamp).toBe("2026-07-01T00:00:00.000Z");
    expect(s.deployedTotalUsd).toBe(350);
    expect(s.liquidatedCount).toBe(1); // a(open) -> b(closed)
    expect(s.survivedCount).toBe(2);   // a and c are open
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/position.test.ts`
Expected: FAIL — cannot find module `./position`.

- [ ] **Step 3: Write minimal implementation**

`lib/position.ts`:
```ts
import { z } from "zod";

export const PositionSnapshotSchema = z.object({
  timestamp: z.string(),
  symbol: z.string(),
  status: z.enum(["open", "closed"]),
  side: z.enum(["long", "short", "flat"]),
  leverage: z.number().nonnegative(),
  entryPrice: z.number().nonnegative(),
  sizeUsd: z.number().nonnegative(),
  marginUsd: z.number().nonnegative(),
  liquidationPrice: z.number().nonnegative(),
  unrealizedPnlUsd: z.number(),
});

export type PositionSnapshot = z.infer<typeof PositionSnapshotSchema>;

export function summarize(history: PositionSnapshot[]): {
  latest: PositionSnapshot | null; deployedTotalUsd: number;
  liquidatedCount: number; survivedCount: number;
} {
  if (history.length === 0)
    return { latest: null, deployedTotalUsd: 0, liquidatedCount: 0, survivedCount: 0 };
  const sorted = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = sorted[sorted.length - 1];
  const deployedTotalUsd = sorted
    .filter((s) => s.status === "open")
    .reduce((sum, s) => sum + s.marginUsd, 0);
  const survivedCount = sorted.filter((s) => s.status === "open").length;
  let liquidatedCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].status === "open" && sorted[i].status === "closed") liquidatedCount++;
  }
  return { latest, deployedTotalUsd, liquidatedCount, survivedCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/position.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/position.ts lib/position.test.ts
git commit -m "feat: position snapshot model and summary aggregation"
```

---

### Task 4: Cron-secret auth helper

**Files:**
- Create: `lib/auth.ts`, `lib/auth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `verifyBearer(authHeader: string | null, expected: string): boolean` — parses `Bearer <token>`, constant-time compares the token to `expected`; returns false on missing header, wrong scheme, length mismatch, or empty `expected`.

- [ ] **Step 1: Write the failing test**

`lib/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { verifyBearer } from "./auth";

describe("verifyBearer", () => {
  it("accepts exact bearer token", () => expect(verifyBearer("Bearer s3cret", "s3cret")).toBe(true));
  it("rejects wrong token", () => expect(verifyBearer("Bearer nope", "s3cret")).toBe(false));
  it("rejects missing header", () => expect(verifyBearer(null, "s3cret")).toBe(false));
  it("rejects wrong scheme", () => expect(verifyBearer("Basic s3cret", "s3cret")).toBe(false));
  it("rejects empty expected", () => expect(verifyBearer("Bearer ", "")).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Write minimal implementation**

`lib/auth.ts`:
```ts
import { timingSafeEqual } from "node:crypto";

export function verifyBearer(authHeader: string | null, expected: string): boolean {
  if (!expected || !authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat: constant-time bearer-token (cron secret) verification"
```

---

### Task 5: DexScreener price reader

**Files:**
- Create: `lib/price.ts`, `lib/price.test.ts`

**Interfaces:**
- Consumes: `fetch` (injected for testing).
- Produces:
  - `type TokenPrice = { priceUsd: number; marketCapUsd: number | null; symbol: string }`
  - `fetchTokenPrice(pairUrlOrId: string, fetchImpl?: typeof fetch): Promise<TokenPrice>` — throws on non-OK response or invalid shape (validated with Zod).

- [ ] **Step 1: Write the failing test**

`lib/price.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/price.test.ts`
Expected: FAIL — cannot find module `./price`.

- [ ] **Step 3: Write minimal implementation**

`lib/price.ts`:
```ts
import { z } from "zod";

export type TokenPrice = { priceUsd: number; marketCapUsd: number | null; symbol: string };

const PairSchema = z.object({
  priceUsd: z.string(),
  marketCap: z.number().nullable().optional(),
  baseToken: z.object({ symbol: z.string() }),
});
const ResponseSchema = z.object({ pairs: z.array(PairSchema).nullable() });

const BASE = "https://api.dexscreener.com/latest/dex/pairs/";

export async function fetchTokenPrice(
  pairUrlOrId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenPrice> {
  const url = pairUrlOrId.startsWith("http") ? pairUrlOrId : BASE + pairUrlOrId;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
  const parsed = ResponseSchema.parse(await res.json());
  const pair = parsed.pairs?.[0];
  if (!pair) throw new Error("DexScreener returned no pair");
  return {
    priceUsd: Number(pair.priceUsd),
    marketCapUsd: pair.marketCap ?? null,
    symbol: pair.baseToken.symbol,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/price.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/price.ts lib/price.test.ts
git commit -m "feat: DexScreener price reader with validated response"
```

---

### Task 6: Solana reward-wallet reader

**Files:**
- Create: `lib/rewards.ts`, `lib/rewards.test.ts`

**Interfaces:**
- Consumes: nothing (takes an injectable balance-reader fn).
- Produces:
  - `type RewardsSummary = { lamports: number; sol: number }`
  - `fetchRewardsBalance(rpcUrl: string, wallet: string, getBalanceImpl?: (rpcUrl: string, wallet: string) => Promise<number>): Promise<RewardsSummary>` — converts lamports→SOL (÷ 1e9); throws on negative/NaN balance. Default impl uses `@solana/web3.js` `Connection.getBalance`.

- [ ] **Step 1: Write the failing test**

`lib/rewards.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/rewards.test.ts`
Expected: FAIL — cannot find module `./rewards`.

- [ ] **Step 3: Write minimal implementation**

`lib/rewards.ts`:
```ts
import { Connection, PublicKey } from "@solana/web3.js";

export type RewardsSummary = { lamports: number; sol: number };

const LAMPORTS_PER_SOL = 1_000_000_000;

async function defaultGetBalance(rpcUrl: string, wallet: string): Promise<number> {
  const conn = new Connection(rpcUrl, "confirmed");
  return conn.getBalance(new PublicKey(wallet));
}

export async function fetchRewardsBalance(
  rpcUrl: string,
  wallet: string,
  getBalanceImpl: (rpcUrl: string, wallet: string) => Promise<number> = defaultGetBalance,
): Promise<RewardsSummary> {
  const lamports = await getBalanceImpl(rpcUrl, wallet);
  if (!Number.isFinite(lamports) || lamports < 0) throw new Error("Invalid balance from RPC");
  return { lamports, sol: lamports / LAMPORTS_PER_SOL };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/rewards.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rewards.ts lib/rewards.test.ts
git commit -m "feat: Solana reward-wallet balance reader"
```

---

### Task 7: AsterDex read-only position reader

**Files:**
- Create: `lib/aster.ts`, `lib/aster.test.ts`

**Interfaces:**
- Consumes: `PositionSnapshot` (Task 3); injectable `fetch` and `nowMs`/`timestamp`.
- Produces:
  - `type AsterCreds = { baseUrl: string; apiKey: string; apiSecret: string }`
  - `signQuery(params: Record<string, string | number>, secret: string): string` — returns the full query string including the appended `signature` (HMAC-SHA256 of the pre-signature query string). Deterministic.
  - `normalizePosition(raw: unknown, timestamp: string): PositionSnapshot` — validates Binance-style `positionRisk` row with Zod and maps to a `PositionSnapshot`.
  - `fetchAsterPosition(creds: AsterCreds, symbol: string, opts?: { fetchImpl?: typeof fetch; nowMs?: number; timestamp?: string }): Promise<PositionSnapshot>` — signed `GET /fapi/v2/positionRisk?symbol=...`, returns the normalized snapshot for `symbol`. Throws on non-OK or empty result.

Mapping (Aster = Binance-Futures-style): `positionAmt`→size/side, `entryPrice`, `markPrice` (size notional = |positionAmt|·markPrice), `leverage`, `liquidationPrice`, `isolatedMargin`→marginUsd, `unRealizedProfit`→unrealizedPnlUsd. `status` = `open` when `positionAmt !== 0` else `closed`; `side` = `long` if `>0`, `short` if `<0`, else `flat`.

- [ ] **Step 1: Write the failing test**

`lib/aster.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/aster.test.ts`
Expected: FAIL — cannot find module `./aster`.

- [ ] **Step 3: Write minimal implementation**

`lib/aster.ts`:
```ts
import { createHmac } from "node:crypto";
import { z } from "zod";
import { PositionSnapshotSchema, type PositionSnapshot } from "./position";

export type AsterCreds = { baseUrl: string; apiKey: string; apiSecret: string };

export function signQuery(params: Record<string, string | number>, secret: string): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signature = createHmac("sha256", secret).update(query).digest("hex");
  return `${query}&signature=${signature}`;
}

const RawRowSchema = z.object({
  symbol: z.string(),
  positionAmt: z.string(),
  entryPrice: z.string(),
  markPrice: z.string(),
  unRealizedProfit: z.string(),
  liquidationPrice: z.string(),
  leverage: z.string(),
  isolatedMargin: z.string(),
});

export function normalizePosition(raw: unknown, timestamp: string): PositionSnapshot {
  const r = RawRowSchema.parse(raw);
  const amt = Number(r.positionAmt);
  const mark = Number(r.markPrice);
  const status = amt !== 0 ? "open" : "closed";
  const side = amt > 0 ? "long" : amt < 0 ? "short" : "flat";
  const snapshot: PositionSnapshot = {
    timestamp,
    symbol: r.symbol,
    status,
    side,
    leverage: Number(r.leverage),
    entryPrice: Number(r.entryPrice),
    sizeUsd: Math.abs(amt) * mark,
    marginUsd: Number(r.isolatedMargin),
    liquidationPrice: Number(r.liquidationPrice),
    unrealizedPnlUsd: Number(r.unRealizedProfit),
  };
  return PositionSnapshotSchema.parse(snapshot);
}

export async function fetchAsterPosition(
  creds: AsterCreds,
  symbol: string,
  opts: { fetchImpl?: typeof fetch; nowMs?: number; timestamp?: string } = {},
): Promise<PositionSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const timestamp = opts.timestamp ?? new Date(nowMs).toISOString();
  const query = signQuery({ symbol, timestamp: nowMs }, creds.apiSecret);
  const url = `${creds.baseUrl}/fapi/v2/positionRisk?${query}`;
  const res = await fetchImpl(url, { headers: { "X-MBX-APIKEY": creds.apiKey } });
  if (!res.ok) throw new Error(`AsterDex error: ${res.status}`);
  const rows = (await res.json()) as unknown[];
  const row = Array.isArray(rows) ? rows.find((x) => (x as { symbol?: string }).symbol === symbol) : undefined;
  if (!row) throw new Error(`AsterDex returned no position for ${symbol}`);
  return normalizePosition(row, timestamp);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/aster.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/aster.ts lib/aster.test.ts
git commit -m "feat: AsterDex read-only position reader (HMAC-signed) + normalization"
```

---

### Task 8: KV-backed snapshot store

**Files:**
- Create: `lib/store.ts`, `lib/store.test.ts`

**Interfaces:**
- Consumes: `PositionSnapshot` (Task 3); an injectable KV client.
- Produces:
  - `type KvLike = { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<unknown> }`
  - `getHistory(kv: KvLike): Promise<PositionSnapshot[]>` — returns `[]` if unset.
  - `appendSnapshot(kv: KvLike, snapshot: PositionSnapshot): Promise<PositionSnapshot[]>` — validates with `PositionSnapshotSchema`, appends immutably, persists, returns the new full history.

- [ ] **Step 1: Write the failing test**

`lib/store.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write minimal implementation**

`lib/store.ts`:
```ts
import { PositionSnapshotSchema, type PositionSnapshot } from "./position";

export type KvLike = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
};

const HISTORY_KEY = "ansemlife:snapshot-history";

export async function getHistory(kv: KvLike): Promise<PositionSnapshot[]> {
  const data = await kv.get<PositionSnapshot[]>(HISTORY_KEY);
  return data ?? [];
}

export async function appendSnapshot(kv: KvLike, snapshot: PositionSnapshot): Promise<PositionSnapshot[]> {
  const valid = PositionSnapshotSchema.parse(snapshot);
  const history = await getHistory(kv);
  const next = [...history, valid];
  await kv.set(HISTORY_KEY, next);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: KV-backed append-only snapshot store"
```

---

### Task 9: API routes (rewards, price, position, cron snapshot)

**Files:**
- Create: `lib/kv.ts`, `app/api/rewards/route.ts`, `app/api/price/route.ts`, `app/api/position/route.ts`, `app/api/cron/snapshot/route.ts`, `app/api/cron/snapshot/route.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (T2), `fetchTokenPrice` (T5), `fetchRewardsBalance` (T6), `fetchAsterPosition` (T7), `getHistory`/`appendSnapshot` (T8), `summarize` (T3), `verifyBearer` (T4).
- Produces HTTP JSON contracts the frontend (T11–T12) consumes:
  - `GET /api/rewards` → `{ sol, lamports, wallet }` or `{ error }` (502).
  - `GET /api/price` → `TokenPrice` or `{ error }` (502).
  - `GET /api/position` → `{ live: PositionSnapshot | null, liveError: string | null, deployedTotalUsd, liquidatedCount, survivedCount, history }`. Live position from AsterDex; on live-read failure, `live` falls back to the latest stored snapshot and `liveError` is set.
  - `POST /api/cron/snapshot` with `Authorization: Bearer <CRON_SECRET>` → reads AsterDex, appends a snapshot, returns `{ ok: true, snapshot }`; `401` on bad secret, `502` on read failure.

- [ ] **Step 1: Add the real KV adapter**

`lib/kv.ts`:
```ts
import { kv } from "@vercel/kv";
import type { KvLike } from "./store";

export const vercelKv: KvLike = {
  get: <T>(key: string) => kv.get<T>(key),
  set: (key, value) => kv.set(key, value),
};
```

- [ ] **Step 2: Write the failing test for the cron snapshot route**

`app/api/cron/snapshot/route.test.ts`:
```ts
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

import { POST } from "./route";

describe("/api/cron/snapshot", () => {
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/cron/snapshot/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 4: Implement the cron snapshot route**

`app/api/cron/snapshot/route.ts`:
```ts
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { vercelKv } from "@/lib/kv";
import { appendSnapshot } from "@/lib/store";
import { fetchAsterPosition } from "@/lib/aster";
import { verifyBearer } from "@/lib/auth";

export async function POST(req: Request) {
  const cfg = loadConfig(process.env);
  if (!verifyBearer(req.headers.get("authorization"), cfg.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await fetchAsterPosition(
      { baseUrl: cfg.asterBaseUrl, apiKey: cfg.asterApiKey, apiSecret: cfg.asterApiSecret },
      cfg.asterSymbol,
    );
    await appendSnapshot(vercelKv, snapshot);
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "snapshot failed" }, { status: 502 });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/cron/snapshot/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implement the read routes (logic already unit-tested in T5/T6/T7)**

`app/api/position/route.ts`:
```ts
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { vercelKv } from "@/lib/kv";
import { getHistory } from "@/lib/store";
import { summarize } from "@/lib/position";
import { fetchAsterPosition } from "@/lib/aster";

export const revalidate = 15;

export async function GET() {
  const cfg = loadConfig(process.env);
  const history = await getHistory(vercelKv);
  const summary = summarize(history);
  let live = summary.latest;
  let liveError: string | null = null;
  try {
    live = await fetchAsterPosition(
      { baseUrl: cfg.asterBaseUrl, apiKey: cfg.asterApiKey, apiSecret: cfg.asterApiSecret },
      cfg.asterSymbol,
    );
  } catch (err) {
    liveError = err instanceof Error ? err.message : "live read failed";
  }
  return NextResponse.json({
    live,
    liveError,
    deployedTotalUsd: summary.deployedTotalUsd,
    liquidatedCount: summary.liquidatedCount,
    survivedCount: summary.survivedCount,
    history,
  });
}
```

`app/api/rewards/route.ts`:
```ts
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { fetchRewardsBalance } from "@/lib/rewards";

export const revalidate = 30;

export async function GET() {
  try {
    const cfg = loadConfig(process.env);
    const r = await fetchRewardsBalance(cfg.solanaRpcUrl, cfg.rewardWallet);
    return NextResponse.json({ ...r, wallet: cfg.rewardWallet });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "rewards read failed" }, { status: 502 });
  }
}
```

`app/api/price/route.ts`:
```ts
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { fetchTokenPrice } from "@/lib/price";

export const revalidate = 30;

export async function GET() {
  try {
    const cfg = loadConfig(process.env);
    const p = await fetchTokenPrice(cfg.targetTokenPair);
    return NextResponse.json(p);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "price read failed" }, { status: 502 });
  }
}
```

- [ ] **Step 7: Run full test suite + build**

Run: `npm test`
Expected: all suites PASS.
Run: `npm run build`
Expected: build succeeds; routes compiled.

- [ ] **Step 8: Commit**

```bash
git add lib/kv.ts app/api
git commit -m "feat: rewards, price, position, and cron-snapshot API routes"
```

---

### Task 10: Shared UI primitives + risk disclaimer

**Files:**
- Create: `components/StatCard.tsx`, `components/Disclaimer.tsx`, `lib/constants.ts`, `components/Disclaimer.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RISK_DISCLAIMER: string` (exact verbatim copy from Global Constraints) in `lib/constants.ts`.
  - `<StatCard label={string} value={string} sub?={string} />`
  - `<Disclaimer />` — renders `RISK_DISCLAIMER`.

- [ ] **Step 1: Write the failing test**

`components/Disclaimer.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Disclaimer } from "./Disclaimer";

describe("Disclaimer", () => {
  it("shows the leverage liquidation warning", () => {
    render(<Disclaimer />);
    expect(screen.getByText(/liquidate the entire position to zero/i)).toBeInTheDocument();
    expect(screen.getByText(/Not financial advice/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/Disclaimer.test.tsx`
Expected: FAIL — cannot find module `./Disclaimer`.

- [ ] **Step 3: Write minimal implementation**

`lib/constants.ts`:
```ts
export const RISK_DISCLAIMER =
  "Not financial advice. AnsemLife uses 10x leverage — a roughly 9–10% adverse price move can liquidate the entire position to zero. Creator rewards are variable and not guaranteed. You can lose money. Position data is read live from AsterDex; AsterDex is the source of truth, not a guarantee of outcome.";
```

`components/Disclaimer.tsx`:
```tsx
import { RISK_DISCLAIMER } from "@/lib/constants";

export function Disclaimer() {
  return (
    <p className="text-xs text-yellow-300/80 border border-yellow-700/50 rounded-md p-3 max-w-3xl">
      {RISK_DISCLAIMER}
    </p>
  );
}
```

`components/StatCard.tsx`:
```tsx
export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-sm text-white/50">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub ? <div className="text-xs text-white/40 mt-1">{sub}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/Disclaimer.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add components/StatCard.tsx components/Disclaimer.tsx lib/constants.ts components/Disclaimer.test.tsx
git commit -m "feat: StatCard primitive and risk disclaimer component"
```

---

### Task 11: Landing page

**Files:**
- Modify: `app/page.tsx`
- Create: `components/HowItWorks.tsx`

**Interfaces:**
- Consumes: `<Disclaimer />` (T10), env `REWARD_WALLET_ADDRESS` for the Solscan link.
- Produces: the public landing page (server component).

- [ ] **Step 1: Build the HowItWorks component**

`components/HowItWorks.tsx`:
```tsx
const STEPS = [
  { n: "1", title: "Coin earns rewards", body: "The AnsemLife pump.fun coin accrues creator rewards on every trade." },
  { n: "2", title: "Rewards deposited", body: "Rewards are collected to a public Solana wallet and deposited to AsterDex." },
  { n: "3", title: "Deployed into a 10x long", body: "Collected rewards fund a 10x long on the target token, read live via a read-only key." },
];

export function HowItWorks() {
  return (
    <section className="grid gap-4 sm:grid-cols-3 max-w-5xl">
      {STEPS.map((s) => (
        <div key={s.n} className="rounded-xl border border-white/10 p-5">
          <div className="text-emerald-400 font-mono">{s.n}</div>
          <h3 className="font-semibold mt-2">{s.title}</h3>
          <p className="text-sm text-white/60 mt-1">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Replace the landing page**

`app/page.tsx`:
```tsx
import Link from "next/link";
import { HowItWorks } from "@/components/HowItWorks";
import { Disclaimer } from "@/components/Disclaimer";

export default function Home() {
  const wallet = process.env.REWARD_WALLET_ADDRESS ?? "";
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-14">
      <header className="space-y-4">
        <h1 className="text-5xl font-extrabold tracking-tight">AnsemLife</h1>
        <p className="text-xl text-white/70 max-w-2xl">
          Every creator reward from the AnsemLife coin is deployed into a 10x long on the target token, read live from AsterDex. Transparent and on-chain.
        </p>
        <div className="flex gap-3">
          <Link href="/dashboard" className="rounded-lg bg-emerald-500 px-5 py-2 font-semibold text-black">View the live dashboard</Link>
        </div>
      </header>
      <HowItWorks />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Transparency</h2>
        <p className="text-sm text-white/60">
          Reward wallet:{" "}
          {wallet ? (
            <a className="text-emerald-400 underline" href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer">{wallet}</a>
          ) : "not configured"}
        </p>
      </section>
      <Disclaimer />
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `/` route compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/HowItWorks.tsx
git commit -m "feat: landing page with how-it-works, transparency, disclaimer"
```

---

### Task 12: Dashboard page (live data fetching)

**Files:**
- Create: `app/dashboard/page.tsx`, `components/PositionPanel.tsx`, `lib/format.ts`, `lib/format.test.ts`

**Interfaces:**
- Consumes: `GET /api/rewards`, `GET /api/price`, `GET /api/position` (T9); `<StatCard />`, `<Disclaimer />` (T10).
- Produces:
  - `lib/format.ts`: `usd(n: number | null): string`, `sol(n: number): string`, `pct(n: number): string`.
  - Dashboard page (client component) showing live stats + position panel + disclaimer.

- [ ] **Step 1: Write the failing test for formatters**

`lib/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { usd, sol } from "./format";

describe("formatters", () => {
  it("formats usd", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(null)).toBe("—");
  });
  it("formats sol", () => {
    expect(sol(2.5)).toBe("2.5000 SOL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — cannot find module `./format`.

- [ ] **Step 3: Implement formatters**

`lib/format.ts`:
```ts
export function usd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function sol(n: number): string {
  return `${n.toFixed(4)} SOL`;
}
export function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the PositionPanel component**

`components/PositionPanel.tsx`:
```tsx
import { usd } from "@/lib/format";

type Live = {
  status: string; side: string; leverage: number; entryPrice: number;
  liquidationPrice: number; unrealizedPnlUsd: number; timestamp: string;
} | null;

export function PositionPanel({ live, liveError }: { live: Live; liveError: string | null }) {
  if (!live) return <div className="text-white/50">No position data yet{liveError ? ` (${liveError})` : ""}.</div>;
  return (
    <div className="rounded-xl border border-white/10 p-5 space-y-2">
      <div className="flex justify-between">
        <span className="font-semibold">Live position — {live.side} ({live.status})</span>
        <span className="text-xs text-white/40">
          {liveError ? `stale: ${liveError}` : `as of ${live.timestamp}`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-white/40">Leverage</div><div>{live.leverage}x</div></div>
        <div><div className="text-white/40">Entry</div><div>{usd(live.entryPrice)}</div></div>
        <div><div className="text-white/40">Liq. price</div><div>{usd(live.liquidationPrice)}</div></div>
        <div><div className="text-white/40">Unrealized PnL</div><div>{usd(live.unrealizedPnlUsd)}</div></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build the dashboard page**

`app/dashboard/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { PositionPanel } from "@/components/PositionPanel";
import { usd, sol } from "@/lib/format";

// Page-boundary JSON from internal API routes; typed loosely on purpose.
type State = {
  rewards?: { sol: number; error?: string };
  price?: { priceUsd: number; marketCapUsd: number | null; symbol: string; error?: string };
  position?: { live: any; liveError: string | null; deployedTotalUsd: number; liquidatedCount: number; survivedCount: number; history: any[] };
};

async function getJson(url: string) {
  const r = await fetch(url);
  return r.json();
}

export default function Dashboard() {
  const [s, setS] = useState<State>({});
  useEffect(() => {
    Promise.all([getJson("/api/rewards"), getJson("/api/price"), getJson("/api/position")])
      .then(([rewards, price, position]) => setS({ rewards, price, position }))
      .catch(() => setS({}));
  }, []);

  const pos = s.position;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold">Live Dashboard</h1>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards collected" value={s.rewards?.error ? "—" : sol(s.rewards?.sol ?? 0)} />
        <StatCard label="Total deployed" value={usd(pos?.deployedTotalUsd ?? 0)} />
        <StatCard
          label={`Target price${s.price?.symbol ? ` (${s.price.symbol})` : ""}`}
          value={s.price?.error ? "—" : usd(s.price?.priceUsd ?? null)}
          sub={pos ? `${pos.survivedCount} open snapshots · ${pos.liquidatedCount} liquidations` : undefined}
        />
      </section>
      <PositionPanel live={pos?.live ?? null} liveError={pos?.liveError ?? null} />
      <Disclaimer />
    </main>
  );
}
```

- [ ] **Step 7: Verify build + full test run**

Run: `npm run build`
Expected: `/dashboard` route compiles.
Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard components/PositionPanel.tsx lib/format.ts lib/format.test.ts
git commit -m "feat: live dashboard with stats, position panel, formatters"
```

---

### Task 13: Vercel cron config + README

**Files:**
- Create: `vercel.json`, `README.md`

**Interfaces:**
- Consumes: `POST /api/cron/snapshot` (T9).
- Produces: scheduled snapshotting + setup/deploy docs.

- [ ] **Step 1: Add the Vercel cron schedule**

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/snapshot", "schedule": "*/15 * * * *" }
  ]
}
```

Note: Vercel Cron sends a GET by default; this route is POST-only and checks `Authorization: Bearer $CRON_SECRET`. Configure the cron to send the `Authorization` header via project settings, or add a thin `GET` handler in `app/api/cron/snapshot/route.ts` that calls the same logic and verifies `CRON_SECRET` — keep whichever the deploy target supports. (Vercel injects `CRON_SECRET` as the bearer when set in env.)

- [ ] **Step 2: Write the README**

`README.md`:
```markdown
# AnsemLife

Transparency dashboard: creator rewards from a pump.fun coin, deployed into a 10x long on a target token via **AsterDex**. The site reads the live position with a **read-only** AsterDex API key — it never places trades.

## Local setup
1. `npm install`
2. Copy `.env.example` → `.env.local` and fill every value.
3. `npm run dev` → http://localhost:3000

## Env vars
| Var | Purpose |
|---|---|
| `ANSEMLIFE_COIN_MINT` | Launched coin mint address |
| `REWARD_WALLET_ADDRESS` | Solana wallet receiving creator rewards |
| `TARGET_TOKEN_PAIR` | DexScreener pair id/URL for the target token |
| `SOLANA_RPC_URL` | Solana RPC endpoint (Helius etc.) |
| `ASTER_BASE_URL` | AsterDex API base (`https://fapi.asterdex.com`) |
| `ASTER_API_KEY` / `ASTER_API_SECRET` | **Read-only** AsterDex key (no TRADE permission) |
| `ASTER_SYMBOL` | AsterDex perp symbol for the target token (e.g. `ANSEMUSDT`) |
| `CRON_SECRET` | Bearer token guarding `/api/cron/snapshot` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV credentials |

## Test
`npm test` (Vitest). Business logic in `lib/` targets 80%+ coverage.

## Deploy (Vercel)
1. Push to GitHub, import in Vercel.
2. Add a Vercel KV store (sets `KV_*` automatically).
3. Set all other env vars (use a **read-only** Aster key).
4. Deploy. The cron in `vercel.json` snapshots the position every 15 min for the history log.

## Important
This involves 10x leverage. A ~9–10% adverse move liquidates the position. The site is read-only and never trades; AsterDex is the source of truth. Not financial advice. **Before launch, confirm the target token is listed as a perp on AsterDex (`ASTER_SYMBOL`).**
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json README.md
git commit -m "docs: Vercel cron config + README with setup and deploy"
```

---

## Self-Review

**Spec coverage:**
- §1 Concept/scope (Aster, read-only, no admin) → landing (T11) + routes (T9). ✓
- §2 Architecture (Next.js, routes, cron, no admin UI) → T1, T9, T13. ✓
- §3 Feeds: rewards (T6/T9), price (T5/T9), live Aster position (T7/T9), history snapshots (T8/T9 cron). ✓
- §4 Pages: landing (T11), dashboard + live position + history-derived counts (T12). ✓
- §5 Data model (`PositionSnapshot`) + append-only store → T3, T8. ✓
- §6 Config via env (incl. Aster + cron) → T2. ✓
- §7 Risk disclaimer (verbatim, landing + dashboard) → T10 constant + T11/T12 placement. ✓
- §8 Decisions (Aster venue, read-only) → reflected throughout. ✓
- §9 Testing (unit/integration incl. signing, normalization, cron auth) → T2–T10, T12. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. `any` appears only at the dashboard page boundary (documented) for cross-route JSON. The T13 cron note offers a concrete GET-handler fallback rather than a vague "handle it".

**Type consistency:** `PositionSnapshot`/`PositionSnapshotSchema` defined in T3, reused in T7 (normalize), T8 (store), T9 (routes). `KvLike` defined in T8, implemented in T9 (`lib/kv.ts`). `AsterCreds`/`fetchAsterPosition` signature in T7 matches calls in T9. `summarize` return shape (`latest`, `deployedTotalUsd`, `liquidatedCount`, `survivedCount`) matches T9 mapping and T12 consumption. `verifyBearer` (T4) matches T9 usage. API JSON contracts in T9 match fetch usage in T12.

**Gating assumption surfaced:** README + spec §8 both note the target token must be listed as a perp on AsterDex (`ASTER_SYMBOL`) — a deploy-time check, not a code task.
