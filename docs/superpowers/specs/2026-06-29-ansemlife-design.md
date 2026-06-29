# AnsemLife — Design Spec

**Date:** 2026-06-29
**Status:** Approved (design phase)

## 1. Concept & Scope

AnsemLife is a **public transparency dashboard + landing page** for a single narrative:

> Every creator reward earned by the AnsemLife pump.fun coin is deployed into a **10x long** on Ansem's token (currently ~100M MC) on the **AsterDex** perpetuals exchange.

The website **proves and narrates** this thesis. It **does not execute trades**. The operator opens/manages the 10x long manually on AsterDex; the dashboard reads the **live position automatically** through a **read-only AsterDex API key** and displays it in real time.

### Explicitly out of scope (YAGNI)
- Automated trade execution / bot integration (no TRADE key, no order placement from the site — read-only only).
- User accounts, wallet connect, on-chain trading from the site.
- Any abstraction layer for "pluggable position sources" — single AsterDex reader, kept simple.

## 2. Architecture

Single **Next.js (TypeScript) full-stack app**, deployed on Vercel.

```
Next.js app
├─ Public pages
│   ├─ Landing  (story + how-it-works + buy CTA + disclaimer)
│   └─ Dashboard (live stats)
├─ API routes (server-side)
│   ├─ /api/rewards         → reads Solana reward wallet inflows via RPC (cached)
│   ├─ /api/price           → reads target-token price/MC via DexScreener (cached)
│   ├─ /api/position        → live position from AsterDex (read-only signed read) + summary over snapshots
│   └─ /api/cron/snapshot   → (cron-secret protected) appends a position snapshot to KV for history
└─ (no public admin UI — read-only API key + scheduled snapshots replace manual entry)
```

The AsterDex API is Binance-Futures-style: `X-MBX-APIKEY` header, HMAC-SHA256 query signing, base `https://fapi.asterdex.com`, signed `GET /fapi/v2/positionRisk`. The key used is **read-only / no TRADE permission**.

## 3. Data Feeds

| Feed | Source | Trust model | UI treatment |
|---|---|---|---|
| **Rewards collected** | Solana RPC (Helius or public) reading the reward wallet's inflows | On-chain, verifiable | Link txs/wallet to Solscan |
| **Target token price / MC** | DexScreener public API | Public, verifiable | Live number |
| **AsterDex position** (size, entry, leverage, unrealized PnL, liq price, margin) | **AsterDex read-only API** (`GET /fapi/v2/positionRisk`, HMAC-signed) | API-verified, real-time | Live numbers + "as of" timestamp |
| **Position history / liquidations** | KV snapshots appended by a scheduled cron read of AsterDex | Derived from the above | History log + survived/liquidated counts |

All external reads are validated (Zod) and cached (short TTL) to avoid rate limits and to fail gracefully (show last-good value + staleness indicator on error). Never trust external API shape — validate before use. The AsterDex key is read-only; the site can never place or modify a trade.

## 4. Pages & Components

### Landing
- **Hero** — the thesis in one line + subhead.
- **How it works** — 3 steps: (1) coin earns creator rewards → (2) operator deposits to AsterDex → (3) deployed into a 10x long on Ansem's token, read live via a read-only key.
- **Live mini-stats strip** — total rewards collected, total deployed, current PnL.
- **Buy CTA** — link to the AnsemLife coin (pump.fun / DEX).
- **Transparency section** — public reward wallet address linked to Solscan.
- **Risk disclaimer** — see Section 7.

### Dashboard
- Big numbers: total rewards collected, total deployed to longs, current position (entry / leverage / PnL / liq price), liquidations survived vs. blown.
- **History log** — full chronological list of every position update + liquidation event.
- Prominent **"As of"** timestamp on the position block (from the live AsterDex read).

### No admin UI
The read-only AsterDex key plus the scheduled snapshot cron replace manual entry. There is no public admin form. The only protected route is `/api/cron/snapshot`, guarded by a `CRON_SECRET`.

## 5. Data Model & Storage

The **live position** comes straight from AsterDex (not stored). Storage is only for **history snapshots**, in **Vercel KV** (simple key-value, no relational schema).

```ts
// Normalized from AsterDex /fapi/v2/positionRisk
type PositionSnapshot = {
  timestamp: string;       // ISO, server-set at read time
  symbol: string;          // e.g. "ANSEMUSDT"
  status: 'open' | 'closed';   // closed = positionAmt 0 (flat / liquidated / exited)
  side: 'long' | 'flat';
  leverage: number;        // e.g. 10
  entryPrice: number;
  sizeUsd: number;         // |positionAmt| * markPrice (notional)
  marginUsd: number;       // isolatedMargin / position initial margin
  liquidationPrice: number;
  unrealizedPnlUsd: number;
}
```

- **Current position** = live AsterDex read (or, if the live read fails, the latest snapshot marked stale).
- **History** = append-only list of snapshots (immutable; never edit in place — new snapshot per cron tick).
- `deployedTotalUsd` and survived/liquidated counts are derived from the snapshot history.

## 6. Configuration (env vars — never hardcoded)

- `ANSEMLIFE_COIN_MINT` — the launched coin's mint address.
- `REWARD_WALLET_ADDRESS` — Solana wallet receiving creator rewards.
- `TARGET_TOKEN_PAIR` — Ansem's token DexScreener pair id/URL for price/MC + label.
- `SOLANA_RPC_URL` — Helius or other RPC endpoint (+ key).
- `ASTER_BASE_URL` — AsterDex API base (default `https://fapi.asterdex.com`).
- `ASTER_API_KEY` / `ASTER_API_SECRET` — **read-only** AsterDex key (no TRADE permission).
- `ASTER_SYMBOL` — the AsterDex perp symbol for the target token (e.g. `ANSEMUSDT`).
- `CRON_SECRET` — bearer token guarding `/api/cron/snapshot`.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — storage credentials.

Validate presence of required env vars at startup; fail fast with a clear message.

## 7. Risk & Legal Layer (non-negotiable)

The site **must** prominently display:
- Not financial advice.
- 10x leverage means a ~9–10% adverse move can liquidate the entire position to zero.
- Creator rewards are variable and not guaranteed.
- No guaranteed returns; participants can lose money.
- Position figures are read **live from AsterDex** via a read-only key (API-verified, not the operator's word — but Aster itself is the source of truth).

This appears on the landing page and near the dashboard position block.

## 8. Decisions Log

- **Venue:** **AsterDex** (perp DEX) — chosen because it has a real, official, documented public API ([`github.com/asterdex/api-docs`](https://github.com/asterdex/api-docs), Binance-Futures-style). KCEX was the original venue but has **no verified public API** (the `kkcex/api-docs` GitHub belongs to a different exchange, `kcash.io`), so it was dropped.
- **Product type:** transparency dashboard (not an auto-trading engine) — read-only key only; the site never places trades.
- **Position feed:** **AsterDex read-only API** (`GET /fapi/v2/positionRisk`, HMAC-signed) for the live position; KV snapshots (cron) for history. No manual admin entry.
- **Stack:** Next.js full-stack TypeScript on Vercel.
- **History:** append-only snapshot log. **Disclaimer:** prominent, required.
- **Gating assumption:** the target token must be **listed as a perp on AsterDex** (`ASTER_SYMBOL`). If it is not, only Aster-listed tokens can be longed — confirm before launch.

## 9. Testing

- Unit: data validation (env config, DexScreener parsing, AsterDex `positionRisk` parsing + normalization, snapshot shape), reward aggregation, summary math, cron-secret check, HMAC signing.
- Integration: API routes (`/api/rewards`, `/api/price`, `/api/position`, `/api/cron/snapshot`) with mocked external sources; cron route rejects bad secret, accepts good.
- E2E: load landing + dashboard renders live stats from a mocked AsterDex read.
- Target 80%+ coverage on business logic (aggregation, validation, normalization, signing, auth).
