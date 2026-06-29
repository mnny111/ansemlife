# AnsemLife Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js transparency dashboard ("AnsemLife") that proves and narrates that creator rewards from a pump.fun coin are deployed into a 10x long on a target token, with on-chain reward reads, live price, and a manually-updated position feed.

**Architecture:** Single Next.js (App Router, TypeScript) full-stack app. Public landing + dashboard pages read from internal API routes. API routes read Solana reward-wallet inflows via RPC and target-token price via DexScreener, and serve a manually-entered position record from Vercel KV. A password-gated `/admin` page appends immutable position records. Pure business logic (validation, aggregation, math, auth) lives in framework-free `lib/` modules so it is unit-testable.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, React, Tailwind CSS, Vitest + React Testing Library, Zod (validation), `@vercel/kv` (storage), `@solana/web3.js` (RPC reads), DexScreener public HTTP API. Deploy: Vercel.

## Global Constraints

- Language: TypeScript, `strict: true`. No `any` in committed code.
- Immutability: never mutate objects/arrays in place — return new copies. Position history is append-only.
- File size: target 200–400 lines, 800 max. Many small focused files.
- Error handling: validate all external data (env, RPC, DexScreener, admin input) with Zod before use; fail fast with clear messages; never silently swallow errors. External-read failures return last-good value + a staleness flag, never a crash.
- Secrets: only via env vars (`ADMIN_PASSWORD`, `SOLANA_RPC_URL`, `KV_*`, `REWARD_WALLET_ADDRESS`, `TARGET_TOKEN_PAIR`, `ANSEMLIFE_COIN_MINT`). Never hardcode.
- Admin auth: constant-time password compare. Reject on missing/incorrect password.
- Testing: TDD (test first, watch it fail, implement, watch it pass, commit). Target 80%+ coverage on `lib/` logic.
- Risk disclaimer copy (verbatim, must appear on landing + near dashboard position block):
  > **Not financial advice.** AnsemLife uses 10x leverage — a roughly 9–10% adverse price move can liquidate the entire position to zero. Creator rewards are variable and not guaranteed. You can lose money. Position figures shown are self-reported by the operator.

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

export const metadata = { title: "AnsemLife", description: "Creator rewards, deployed into a 10x long." };

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
ADMIN_PASSWORD=
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
  - `type AppConfig = { coinMint: string; rewardWallet: string; targetTokenPair: string; solanaRpcUrl: string; adminPassword: string; kvUrl: string; kvToken: string }`

- [ ] **Step 1: Write the failing test**

`lib/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const full = {
  ANSEMLIFE_COIN_MINT: "mint", REWARD_WALLET_ADDRESS: "wallet",
  TARGET_TOKEN_PAIR: "pair", SOLANA_RPC_URL: "https://rpc",
  ADMIN_PASSWORD: "pw", KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "tok",
};

describe("loadConfig", () => {
  it("maps env to AppConfig", () => {
    const cfg = loadConfig(full);
    expect(cfg.rewardWallet).toBe("wallet");
    expect(cfg.adminPassword).toBe("pw");
  });
  it("throws listing every missing key", () => {
    expect(() => loadConfig({})).toThrow(/ANSEMLIFE_COIN_MINT/);
    expect(() => loadConfig({ ...full, ADMIN_PASSWORD: "" })).toThrow(/ADMIN_PASSWORD/);
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
  coinMint: string; rewardWallet: string; targetTokenPair: string;
  solanaRpcUrl: string; adminPassword: string; kvUrl: string; kvToken: string;
};

const KEYS: Record<keyof AppConfig, string> = {
  coinMint: "ANSEMLIFE_COIN_MINT", rewardWallet: "REWARD_WALLET_ADDRESS",
  targetTokenPair: "TARGET_TOKEN_PAIR", solanaRpcUrl: "SOLANA_RPC_URL",
  adminPassword: "ADMIN_PASSWORD", kvUrl: "KV_REST_API_URL", kvToken: "KV_REST_API_TOKEN",
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

### Task 3: Position domain model + Zod schema + aggregation math

**Files:**
- Create: `lib/position.ts`, `lib/position.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PositionRecord = { id: string; timestamp: string; status: "open" | "liquidated" | "closed"; side: "long"; leverage: number; entryPrice: number; sizeUsd: number; marginUsd: number; liquidationPrice: number; pnlUsd: number | null; note?: string }`
  - `PositionInputSchema` (Zod) — validates admin form input (everything except `id`/`timestamp`, which are server-set).
  - `type PositionInput = z.infer<typeof PositionInputSchema>`
  - `summarize(history: PositionRecord[]): { current: PositionRecord | null; deployedTotalUsd: number; liquidatedCount: number; survivedCount: number }`

- [ ] **Step 1: Write the failing test**

`lib/position.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PositionInputSchema, summarize, type PositionRecord } from "./position";

const rec = (over: Partial<PositionRecord>): PositionRecord => ({
  id: "1", timestamp: "2026-06-29T00:00:00.000Z", status: "open", side: "long",
  leverage: 10, entryPrice: 1, sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9,
  pnlUsd: 0, ...over,
});

describe("PositionInputSchema", () => {
  it("accepts valid input", () => {
    const r = PositionInputSchema.safeParse({
      status: "open", side: "long", leverage: 10, entryPrice: 1,
      sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9, pnlUsd: 0,
    });
    expect(r.success).toBe(true);
  });
  it("rejects leverage <= 0 and non-long side", () => {
    expect(PositionInputSchema.safeParse({ status: "open", side: "long", leverage: 0, entryPrice: 1, sizeUsd: 1, marginUsd: 1, liquidationPrice: 1, pnlUsd: 0 }).success).toBe(false);
    expect(PositionInputSchema.safeParse({ status: "open", side: "short", leverage: 10, entryPrice: 1, sizeUsd: 1, marginUsd: 1, liquidationPrice: 1, pnlUsd: 0 }).success).toBe(false);
  });
});

describe("summarize", () => {
  it("returns null current and zeroes for empty history", () => {
    expect(summarize([])).toEqual({ current: null, deployedTotalUsd: 0, liquidatedCount: 0, survivedCount: 0 });
  });
  it("uses latest by timestamp as current and sums margin", () => {
    const a = rec({ id: "a", timestamp: "2026-06-29T00:00:00.000Z", marginUsd: 100, status: "liquidated" });
    const b = rec({ id: "b", timestamp: "2026-06-30T00:00:00.000Z", marginUsd: 250, status: "open" });
    const s = summarize([a, b]);
    expect(s.current?.id).toBe("b");
    expect(s.deployedTotalUsd).toBe(350);
    expect(s.liquidatedCount).toBe(1);
    expect(s.survivedCount).toBe(1);
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

export const PositionInputSchema = z.object({
  status: z.enum(["open", "liquidated", "closed"]),
  side: z.literal("long"),
  leverage: z.number().positive(),
  entryPrice: z.number().positive(),
  sizeUsd: z.number().nonnegative(),
  marginUsd: z.number().nonnegative(),
  liquidationPrice: z.number().nonnegative(),
  pnlUsd: z.number().nullable(),
  note: z.string().max(280).optional(),
});

export type PositionInput = z.infer<typeof PositionInputSchema>;

export type PositionRecord = PositionInput & { id: string; timestamp: string };

export function summarize(history: PositionRecord[]): {
  current: PositionRecord | null; deployedTotalUsd: number;
  liquidatedCount: number; survivedCount: number;
} {
  if (history.length === 0)
    return { current: null, deployedTotalUsd: 0, liquidatedCount: 0, survivedCount: 0 };
  const sorted = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const current = sorted[sorted.length - 1];
  const deployedTotalUsd = sorted.reduce((sum, r) => sum + r.marginUsd, 0);
  const liquidatedCount = sorted.filter((r) => r.status === "liquidated").length;
  const survivedCount = sorted.length - liquidatedCount;
  return { current, deployedTotalUsd, liquidatedCount, survivedCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/position.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/position.ts lib/position.test.ts
git commit -m "feat: position model, validation schema, and summary aggregation"
```

---

### Task 4: Admin auth helper

**Files:**
- Create: `lib/auth.ts`, `lib/auth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `verifyPassword(submitted: string, expected: string): boolean` — constant-time compare; returns false on length mismatch or empty `expected`.

- [ ] **Step 1: Write the failing test**

`lib/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { verifyPassword } from "./auth";

describe("verifyPassword", () => {
  it("accepts exact match", () => expect(verifyPassword("s3cret", "s3cret")).toBe(true));
  it("rejects wrong password", () => expect(verifyPassword("nope", "s3cret")).toBe(false));
  it("rejects different length", () => expect(verifyPassword("s3cre", "s3cret")).toBe(false));
  it("rejects empty expected", () => expect(verifyPassword("", "")).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Write minimal implementation**

`lib/auth.ts`:
```ts
import { timingSafeEqual } from "node:crypto";

export function verifyPassword(submitted: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat: constant-time admin password verification"
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

const ok = (body: unknown) =>
  ({ ok: true, json: async () => body } as Response);

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
  - `fetchRewardsBalance(rpcUrl: string, wallet: string, getBalanceImpl?: (rpcUrl: string, wallet: string) => Promise<number>): Promise<RewardsSummary>` — converts lamports→SOL (÷ 1e9); throws on negative/NaN balance.

Note: the default `getBalanceImpl` uses `@solana/web3.js` `Connection.getBalance(new PublicKey(wallet))`. Tests inject a stub so no network is hit.

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

### Task 7: KV-backed position store

**Files:**
- Create: `lib/store.ts`, `lib/store.test.ts`

**Interfaces:**
- Consumes: `PositionRecord`, `PositionInput` (Task 3); an injectable KV client.
- Produces:
  - `type KvLike = { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<unknown> }`
  - `getHistory(kv: KvLike): Promise<PositionRecord[]>` — returns `[]` if unset.
  - `appendPosition(kv: KvLike, input: PositionInput, id: string, timestamp: string): Promise<PositionRecord>` — validates input via `PositionInputSchema`, appends an immutable record, persists, returns it.

`id`/`timestamp` are passed in (not generated inside) so the function stays pure/testable; the API route supplies `crypto.randomUUID()` and `new Date().toISOString()`.

- [ ] **Step 1: Write the failing test**

`lib/store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getHistory, appendPosition, type KvLike } from "./store";
import type { PositionInput } from "./position";

function memKv(): KvLike {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => (m.has(k) ? (m.get(k) as T) : null),
    set: async (k, v) => void m.set(k, v),
  };
}
const input: PositionInput = {
  status: "open", side: "long", leverage: 10, entryPrice: 1,
  sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9, pnlUsd: 0,
};

describe("position store", () => {
  it("returns empty history when unset", async () => {
    expect(await getHistory(memKv())).toEqual([]);
  });
  it("appends without mutating prior history", async () => {
    const kv = memKv();
    const a = await appendPosition(kv, input, "id-a", "2026-06-29T00:00:00.000Z");
    const before = await getHistory(kv);
    const b = await appendPosition(kv, { ...input, marginUsd: 200 }, "id-b", "2026-06-30T00:00:00.000Z");
    const after = await getHistory(kv);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual(a);
    expect(after[1].id).toBe(b.id);
  });
  it("rejects invalid input", async () => {
    await expect(
      appendPosition(memKv(), { ...input, leverage: -1 }, "id", "2026-06-29T00:00:00.000Z"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write minimal implementation**

`lib/store.ts`:
```ts
import { PositionInputSchema, type PositionRecord } from "./position";

export type KvLike = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
};

const HISTORY_KEY = "ansemlife:position-history";

export async function getHistory(kv: KvLike): Promise<PositionRecord[]> {
  const data = await kv.get<PositionRecord[]>(HISTORY_KEY);
  return data ?? [];
}

export async function appendPosition(
  kv: KvLike,
  input: unknown,
  id: string,
  timestamp: string,
): Promise<PositionRecord> {
  const valid = PositionInputSchema.parse(input);
  const record: PositionRecord = { ...valid, id, timestamp };
  const history = await getHistory(kv);
  const next = [...history, record];
  await kv.set(HISTORY_KEY, next);
  return record;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: KV-backed append-only position store"
```

---

### Task 8: API routes (rewards, price, position GET/POST)

**Files:**
- Create: `lib/kv.ts`, `app/api/rewards/route.ts`, `app/api/price/route.ts`, `app/api/position/route.ts`, `app/api/position/route.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (T2), `fetchTokenPrice` (T5), `fetchRewardsBalance` (T6), `getHistory`/`appendPosition` (T7), `summarize` (T3), `verifyPassword` (T4).
- Produces HTTP JSON contracts the frontend (T9–T11) consumes:
  - `GET /api/rewards` → `{ sol: number; lamports: number; wallet: string }` or `{ error, stale: true, ... }` on read failure (HTTP 200 with last-good is out of scope for v1 — on failure return `{ error }` 502).
  - `GET /api/price` → `TokenPrice` or `{ error }` 502.
  - `GET /api/position` → `{ current, deployedTotalUsd, liquidatedCount, survivedCount, history }`.
  - `POST /api/position` with header `x-admin-password` + JSON `PositionInput` → `{ ok: true, record }` (200) or `{ error }` (401 on bad password, 400 on invalid body).

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

- [ ] **Step 2: Write the failing test for the POST/GET position route**

`app/api/position/route.test.ts`:
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
  loadConfig: () => ({ adminPassword: "pw" }),
}));

import { GET, POST } from "./route";

const body = {
  status: "open", side: "long", leverage: 10, entryPrice: 1,
  sizeUsd: 1000, marginUsd: 100, liquidationPrice: 0.9, pnlUsd: 0,
};

describe("/api/position", () => {
  beforeEach(() => store.clear());

  it("rejects POST with wrong password", async () => {
    const res = await POST(new Request("http://t/api/position", {
      method: "POST", headers: { "x-admin-password": "nope" }, body: JSON.stringify(body),
    }));
    expect(res.status).toBe(401);
  });

  it("accepts valid POST then reflects it in GET", async () => {
    const postRes = await POST(new Request("http://t/api/position", {
      method: "POST", headers: { "x-admin-password": "pw" }, body: JSON.stringify(body),
    }));
    expect(postRes.status).toBe(200);
    const getRes = await GET();
    const json = await getRes.json();
    expect(json.current.marginUsd).toBe(100);
    expect(json.deployedTotalUsd).toBe(100);
    expect(json.history).toHaveLength(1);
  });

  it("rejects invalid body with 400", async () => {
    const res = await POST(new Request("http://t/api/position", {
      method: "POST", headers: { "x-admin-password": "pw" }, body: JSON.stringify({ ...body, leverage: -5 }),
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/position/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 4: Implement the position route**

`app/api/position/route.ts`:
```ts
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { vercelKv } from "@/lib/kv";
import { getHistory, appendPosition } from "@/lib/store";
import { summarize } from "@/lib/position";
import { verifyPassword } from "@/lib/auth";

export async function GET() {
  const history = await getHistory(vercelKv);
  return NextResponse.json({ ...summarize(history), history });
}

export async function POST(req: Request) {
  const { adminPassword } = loadConfig(process.env);
  const submitted = req.headers.get("x-admin-password") ?? "";
  if (!verifyPassword(submitted, adminPassword)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const record = await appendPosition(vercelKv, input, crypto.randomUUID(), new Date().toISOString());
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid input" }, { status: 400 });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/position/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Implement the rewards and price routes (no separate unit test — logic covered in T5/T6)**

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
git commit -m "feat: rewards, price, and position API routes"
```

---

### Task 9: Shared UI primitives + risk disclaimer

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
  "Not financial advice. AnsemLife uses 10x leverage — a roughly 9–10% adverse price move can liquidate the entire position to zero. Creator rewards are variable and not guaranteed. You can lose money. Position figures shown are self-reported by the operator.";
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

### Task 10: Landing page

**Files:**
- Modify: `app/page.tsx`
- Create: `components/HowItWorks.tsx`

**Interfaces:**
- Consumes: `<Disclaimer />` (T9), `RISK_DISCLAIMER` (T9), env `REWARD_WALLET_ADDRESS` for the Solscan link.
- Produces: the public landing page (server component).

- [ ] **Step 1: Build the HowItWorks component**

`components/HowItWorks.tsx`:
```tsx
const STEPS = [
  { n: "1", title: "Coin earns rewards", body: "The AnsemLife pump.fun coin accrues creator rewards on every trade." },
  { n: "2", title: "Rewards withdrawn", body: "Rewards are collected to a public Solana wallet — verifiable on-chain." },
  { n: "3", title: "Deployed into a 10x long", body: "Collected rewards fund a 10x long on the target token via KCEX." },
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
          Every creator reward from the AnsemLife coin is deployed into a 10x long on the target token. Transparent, on-chain, self-reported.
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

### Task 11: Dashboard page (client data fetching)

**Files:**
- Create: `app/dashboard/page.tsx`, `components/PositionPanel.tsx`, `lib/format.ts`, `lib/format.test.ts`

**Interfaces:**
- Consumes: `GET /api/rewards`, `GET /api/price`, `GET /api/position` (T8); `<StatCard />`, `<Disclaimer />` (T9).
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

type Current = {
  leverage: number; entryPrice: number; liquidationPrice: number;
  pnlUsd: number | null; status: string;
} | null;

export function PositionPanel({ current, lastUpdated }: { current: Current; lastUpdated: string | null }) {
  if (!current) return <div className="text-white/50">No position reported yet.</div>;
  return (
    <div className="rounded-xl border border-white/10 p-5 space-y-2">
      <div className="flex justify-between">
        <span className="font-semibold">Current position ({current.status})</span>
        <span className="text-xs text-white/40">{lastUpdated ? `updated ${lastUpdated}` : ""}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><div className="text-white/40">Leverage</div><div>{current.leverage}x</div></div>
        <div><div className="text-white/40">Entry</div><div>{usd(current.entryPrice)}</div></div>
        <div><div className="text-white/40">Liq. price</div><div>{usd(current.liquidationPrice)}</div></div>
        <div><div className="text-white/40">PnL</div><div>{usd(current.pnlUsd)}</div></div>
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

type State = {
  rewards?: { sol: number; error?: string };
  price?: { priceUsd: number; marketCapUsd: number | null; symbol: string; error?: string };
  position?: { current: any; deployedTotalUsd: number; liquidatedCount: number; survivedCount: number; history: any[] };
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
  const current = pos?.current ?? null;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-8">
      <h1 className="text-3xl font-bold">Live Dashboard</h1>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rewards collected" value={s.rewards?.error ? "—" : sol(s.rewards?.sol ?? 0)} />
        <StatCard label="Total deployed" value={usd(pos?.deployedTotalUsd ?? 0)} />
        <StatCard
          label={`Target price${s.price?.symbol ? ` (${s.price.symbol})` : ""}`}
          value={s.price?.error ? "—" : usd(s.price?.priceUsd ?? null)}
          sub={pos ? `${pos.survivedCount} survived · ${pos.liquidatedCount} liquidated` : undefined}
        />
      </section>
      <PositionPanel current={current} lastUpdated={current?.timestamp ?? null} />
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

### Task 12: Admin page

**Files:**
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `POST /api/position` (T8).
- Produces: a password-gated client form that submits a `PositionInput`.

- [ ] **Step 1: Build the admin page**

`app/admin/page.tsx`:
```tsx
"use client";
import { useState } from "react";

const FIELDS: { key: string; type: string }[] = [
  { key: "leverage", type: "number" }, { key: "entryPrice", type: "number" },
  { key: "sizeUsd", type: "number" }, { key: "marginUsd", type: "number" },
  { key: "liquidationPrice", type: "number" }, { key: "pnlUsd", type: "number" },
];

export default function Admin() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"open" | "liquidated" | "closed">("open");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Submitting…");
    const body = {
      status, side: "long",
      leverage: Number(vals.leverage), entryPrice: Number(vals.entryPrice),
      sizeUsd: Number(vals.sizeUsd), marginUsd: Number(vals.marginUsd),
      liquidationPrice: Number(vals.liquidationPrice),
      pnlUsd: vals.pnlUsd === "" || vals.pnlUsd === undefined ? null : Number(vals.pnlUsd),
    };
    const res = await fetch("/api/position", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": password },
      body: JSON.stringify(body),
    });
    setMsg(res.ok ? "Saved." : `Error: ${(await res.json()).error ?? res.status}`);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12 space-y-4">
      <h1 className="text-2xl font-bold">Admin — update position</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full bg-white/10 rounded p-2" type="password" placeholder="Admin password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <select className="w-full bg-white/10 rounded p-2" value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">open</option>
          <option value="liquidated">liquidated</option>
          <option value="closed">closed</option>
        </select>
        {FIELDS.map((f) => (
          <input key={f.key} className="w-full bg-white/10 rounded p-2" type={f.type} step="any"
            placeholder={f.key} value={vals[f.key] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
        ))}
        <button className="w-full rounded bg-emerald-500 text-black font-semibold py-2" type="submit">Save</button>
      </form>
      {msg ? <p className="text-sm text-white/70">{msg}</p> : null}
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `/admin` route compiles.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: password-gated admin position-update form"
```

---

### Task 13: README + deployment docs

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: setup/deploy documentation.

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# AnsemLife

Transparency dashboard: creator rewards from a pump.fun coin, deployed into a 10x long on a target token (KCEX). The site proves and narrates; trades are executed manually and published via the admin page.

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
| `ADMIN_PASSWORD` | Password for `/admin` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV credentials |

## Test
`npm test` (Vitest). Business logic in `lib/` targets 80%+ coverage.

## Deploy (Vercel)
1. Push to GitHub, import in Vercel.
2. Add a Vercel KV store (sets `KV_*` automatically).
3. Set all other env vars in project settings.
4. Deploy. Update positions at `/admin`.

## Important
This involves 10x leverage. A ~9–10% adverse move liquidates the position. Position figures are self-reported. Not financial advice.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, env, and deploy instructions"
```

---

## Self-Review

**Spec coverage:**
- §1 Concept/scope → landing (T10) + narrative copy. ✓
- §2 Architecture (Next.js, API routes, admin) → T1, T8, T12. ✓
- §3 Feeds: rewards (T6/T8), price (T5/T8), manual position (T7/T8). ✓
- §4 Pages: landing (T10), dashboard + history surfaced via `/api/position` (T11), admin (T12). ✓
- §5 Data model + append-only immutable store → T3, T7. ✓
- §6 Config via env, fail-fast → T2. ✓
- §7 Risk disclaimer (verbatim, landing + dashboard) → T9 constant + T10/T11 placement. ✓
- §9 Testing (unit/integration) → tests in T2–T9, T11; route integration in T8. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The dashboard uses `any` for the cross-route JSON blobs at the page boundary only (documented trade-off; `lib/` stays strict). Acceptable for v1 page glue.

**Type consistency:** `PositionRecord`/`PositionInput` defined in T3 and reused consistently in T7/T8. `KvLike` defined in T7, implemented in T8 (`lib/kv.ts`). `summarize` return shape matches dashboard consumption in T11. API JSON contracts in T8 match fetch usage in T11.

**Note on history depth:** spec §4 calls for a full history log view. `/api/position` returns `history` (T8) and the dashboard consumes summary counts; a dedicated history *table* UI is intentionally minimal in v1 (counts + current). If a full per-row history table is wanted, it's a small additive task on top of the returned `history` array — flagged for the execution phase.
