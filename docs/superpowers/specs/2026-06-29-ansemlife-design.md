# AnsemLife — Design Spec

**Date:** 2026-06-29
**Status:** Approved (design phase)

## 1. Concept & Scope

AnsemLife is a **public transparency dashboard + landing page** for a single narrative:

> Every creator reward earned by the AnsemLife pump.fun coin is deployed into a **10x long** on Ansem's token (currently ~100M MC) on the KCEX exchange.

The website **proves and narrates** this thesis. It **does not execute trades**. Trade execution is performed manually by the operator on KCEX; the resulting position is published to the site through a private admin page.

### Explicitly out of scope (YAGNI)
- Automated trade execution / bot integration.
- KCEX API integration (KCEX has **no verified public trading API** — see Decisions Log). The position feed is manual-only.
- User accounts, wallet connect, on-chain trading from the site.
- Any abstraction layer for "pluggable position sources" — manual only, kept simple.

## 2. Architecture

Single **Next.js (TypeScript) full-stack app**, deployed on Vercel.

```
Next.js app
├─ Public pages
│   ├─ Landing  (story + how-it-works + buy CTA + disclaimer)
│   └─ Dashboard (live stats)
├─ API routes (server-side)
│   ├─ /api/rewards   → reads Solana reward wallet inflows via RPC (cached)
│   ├─ /api/price     → reads target-token price/MC via DexScreener (cached)
│   └─ /api/position  → returns current manually-entered position + history
└─ Admin
    └─ /admin (password-gated) → form to append a new position record
```

## 3. Data Feeds

| Feed | Source | Trust model | UI treatment |
|---|---|---|---|
| **Rewards collected** | Solana RPC (Helius or public) reading the reward wallet's inflows | On-chain, verifiable | Link txs/wallet to Solscan |
| **Target token price / MC** | DexScreener public API | Public, verifiable | Live number |
| **KCEX position** (size, entry, leverage, PnL, liq price, total deployed) | **Manual admin entry**, stored server-side with `lastUpdated` timestamp | Trust-based / self-reported | Labeled clearly as "self-reported", prominent "last updated" |

All external reads are validated and cached (short TTL) to avoid rate limits and to fail gracefully (show last-good value + staleness indicator on error). Never trust external API shape — validate before use.

## 4. Pages & Components

### Landing
- **Hero** — the thesis in one line + subhead.
- **How it works** — 3 steps: (1) coin earns creator rewards → (2) operator withdraws to KCEX → (3) deployed into a 10x long on Ansem's token.
- **Live mini-stats strip** — total rewards collected, total deployed, current PnL.
- **Buy CTA** — link to the AnsemLife coin (pump.fun / DEX).
- **Transparency section** — public reward wallet address linked to Solscan.
- **Risk disclaimer** — see Section 7.

### Dashboard
- Big numbers: total rewards collected, total deployed to longs, current position (entry / leverage / PnL / liq price), liquidations survived vs. blown.
- **History log** — full chronological list of every position update + liquidation event.
- Prominent **"Last updated"** timestamp on the position block.

### Admin (`/admin`)
- Single-password gate (env var; constant-time compare).
- Form that appends a new immutable position record (current = latest record).

## 5. Data Model & Storage

Storage: **Vercel KV** (or equivalent simple key-value), no relational schema.

```ts
type PositionRecord = {
  id: string;            // generated server-side
  timestamp: string;     // ISO, server-set
  status: 'open' | 'liquidated' | 'closed';
  side: 'long';
  leverage: number;      // e.g. 10
  entryPrice: number;
  sizeUsd: number;       // notional
  marginUsd: number;     // collateral deployed
  liquidationPrice: number;
  pnlUsd: number | null; // self-reported snapshot
  note?: string;
}
```

- **Current position** = most recent record.
- **History** = full append-only list (immutable; never edit in place — new record per change).
- `deployedTotal` = sum of `marginUsd` across all records, or a separately tracked running total.

## 6. Configuration (env vars — never hardcoded)

- `ANSEMLIFE_COIN_MINT` — the launched coin's mint address.
- `REWARD_WALLET_ADDRESS` — Solana wallet receiving creator rewards.
- `TARGET_TOKEN` — Ansem's token identifier (mint / DexScreener pair) for price/MC + label.
- `SOLANA_RPC_URL` — Helius or other RPC endpoint (+ key).
- `ADMIN_PASSWORD` — admin gate.
- `KV_*` — storage credentials.

Validate presence of required env vars at startup; fail fast with a clear message.

## 7. Risk & Legal Layer (non-negotiable)

The site **must** prominently display:
- Not financial advice.
- 10x leverage means a ~9–10% adverse move can liquidate the entire position to zero.
- Creator rewards are variable and not guaranteed.
- No guaranteed returns; participants can lose money.
- Position figures are **self-reported** by the operator.

This appears on the landing page and near the dashboard position block.

## 8. Decisions Log

- **Venue:** KCEX (CEX) — chosen because it lists leveraged perps on memecoins. **No verified public API** exists (the `kkcex/api-docs` GitHub belongs to a different exchange, `kcash.io`; KCEX not confirmed in CCXT). Therefore position feed is manual.
- **Product type:** transparency dashboard (not an auto-trading engine) — buildable now, lowest legal/technical risk.
- **Position feed:** manual admin entry only (no pluggable adapter) — YAGNI.
- **Stack:** Next.js full-stack TypeScript on Vercel.
- **History:** full append-only log. **Disclaimer:** prominent, required.

## 9. Testing

- Unit: data validation (env config, external API response parsing, position record shape), reward aggregation, PnL/total math.
- Integration: API routes (`/api/rewards`, `/api/price`, `/api/position`) with mocked external sources; admin auth (reject bad password, accept good).
- E2E: load landing + dashboard renders live stats; admin login → submit position → dashboard reflects update.
- Target 80%+ coverage on business logic (aggregation, validation, auth).
