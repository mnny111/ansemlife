# AnsemLife — Auto-Deploy to Long (Design)

**Date:** 2026-06-29
**Status:** Approved (pending spec review)

## 1. Summary

Add automated trade execution to AnsemLife. Today the site is a **read-only**
transparency dashboard: the operator opens the 10x long by hand and the site
only reads the position. This feature makes the long **self-funding**:

> When USDT is manually deposited into the AsterDex futures account, a cron job
> running **every minute** detects the new free balance and automatically
> deploys ~95% of it into the 10x long on `ASTER_SYMBOL` — opening the position
> the first time and **adding to it** on every later deposit. The website also
> displays the **live Aster account balance**.

The operator still performs the SOL → USDT → Aster-deposit step by hand
(swap + cross-chain bridge). Code never touches Solana or any bridge. Code's
job begins once USDT is sitting in the Aster account.

## 2. Scope change & security posture

This **intentionally breaks** the project's prior "read-only, never executes
trades" thesis. To contain blast radius we use **two separate API keys**
(least privilege):

| Key | Permission | Used by | Exposure |
|---|---|---|---|
| `ASTER_API_KEY` / `ASTER_API_SECRET` (existing) | **Read-only** | Public display routes (`/api/position`, `/api/balance`) | Public-path reads only |
| `ASTER_TRADE_API_KEY` / `ASTER_TRADE_API_SECRET` (new) | **TRADE** | Deploy cron only (`/api/cron/deploy`) | Never reachable from a public route |

- The TRADE key is read **only** inside the CRON_SECRET-guarded deploy route.
- Recommend IP-whitelisting the TRADE key to Vercel egress IPs in the Aster
  API console.
- No public admin UI; no order placement is reachable without the cron secret.

## 3. Detection: "drain available balance"

Chosen over delta-tracking for simplicity and natural idempotency.

- Cron reads `availableBalance` (free USDT) from `GET /fapi/v2/account`.
- If `availableBalance >= MIN_DEPLOY_USD`, deploy it; else no-op.
- After a deploy, free balance drops to ~0, so the job will not re-fire until
  the next deposit. No stored "last balance" delta math required.
- A short-TTL **KV lock** prevents two overlapping cron ticks from
  double-ordering.

## 4. Deploy logic (per run)

1. **Acquire KV lock** (`deploy:lock`, TTL ~50s). If held, exit (another tick
   is running).
2. **Read balance** via `GET /fapi/v2/account` (TRADE key, HMAC-signed).
   `availableBalance < MIN_DEPLOY_USD` → release lock, exit.
3. **Price guard.** Fetch recent klines (`GET /fapi/v1/klines`). If `markPrice`
   moved more than `PRICE_GUARD_PCT` over the last `PRICE_GUARD_WINDOW_MIN`
   minutes, **abort this tick**, log it, retry next minute. (Avoids buying a
   wick / deploying into a violent move.)
4. **Ensure leverage** = `LEVERAGE` (10) via `POST /fapi/v1/leverage`.
5. **Size the order:**
   `qty = floor((availableBalance * DEPLOY_FRACTION * LEVERAGE) / markPrice)`
   rounded down to the symbol's `stepSize` (from exchangeInfo). If rounded
   `qty <= 0`, exit.
6. **Place order:** `POST /fapi/v1/order` — market **BUY**. This opens the long
   the first time and **increases** `positionAmt` thereafter.
7. **Record:** append a KV snapshot describing the deploy (timestamp, amount
   deployed, qty, markPrice, resulting position) for the history log.
8. **Release lock.**

All steps wrapped so any failure logs context, releases the lock, and returns a
non-2xx without leaking secrets. A failed tick simply retries next minute.

## 5. Website display

- New `GET /api/balance` (read-only key) returns `{ walletBalance,
  availableBalance, timestamp }` from `GET /fapi/v2/account`.
- Frontend adds a **"Deposited (Aster account)"** stat alongside existing
  position stats, with an **"as of"** timestamp. `walletBalance` =
  total equity in account; `availableBalance` = free (not yet deployed).

## 6. Constants (`lib/constants.ts`)

| Name | Value | Meaning |
|---|---|---|
| `LEVERAGE` | `10` | Target leverage |
| `DEPLOY_FRACTION` | `0.95` | Fraction of free balance used as margin (buffer for fees/slippage) |
| `MIN_DEPLOY_USD` | `10` | Don't deploy dust |
| `PRICE_GUARD_PCT` | `3` | Abort if mark moved more than this % in the window |
| `PRICE_GUARD_WINDOW_MIN` | `5` | Price-guard lookback window |

All tunable via env override; no magic numbers inline.

## 7. Files

**New**
- `app/api/cron/deploy/route.ts` — auto-deploy cron, CRON_SECRET-guarded.
- `app/api/balance/route.ts` — account balance for display (read-only key).
- `components/BalanceStat.tsx` — the "Deposited" stat on the dashboard.

**Changed**
- `lib/aster.ts` — add `fetchAccountBalance`, `setLeverage`, `recentPriceMove`,
  `getSymbolStep`, `openOrAddLong` (each small, single-purpose; signing reuses
  existing `signQuery`). Keep functions immutable / return new objects.
- `lib/constants.ts` — add the constants in §6.
- `lib/config.ts` — load + validate `ASTER_TRADE_API_KEY/SECRET` (Zod).
- `vercel.json` — add `{ "path": "/api/cron/deploy", "schedule": "* * * * *" }`.
- `.env.example` — document the new TRADE key vars.
- Dashboard page — render `BalanceStat`.

## 8. Testing

- **Unit:** order sizing (buffer + stepSize rounding, qty<=0 guard), price-guard
  abort vs proceed, balance parse/normalize, account-balance parse, HMAC
  signing of new endpoints, config validation of the TRADE key.
- **Integration:** `/api/cron/deploy` — rejects bad/missing CRON_SECRET; with a
  mocked Aster client: below-threshold no-op, price-guard abort, happy-path
  deploy, lock-held skip. `/api/balance` returns normalized shape.
- Target 80%+ coverage, consistent with the existing suite.

## 9. Deployment dependency ⚠️

Every-minute cron requires **Vercel Pro** (Hobby caps cron at once/day). On
Hobby the deploy would only run daily. Confirm Pro before relying on
minute-level automation.

## 10. Risks

- **10x market deploy is fragile.** Mitigated by `DEPLOY_FRACTION` buffer +
  price guard, but a deposit during high volatility can still fill poorly. The
  guard reduces, not eliminates, this.
- **TRADE key custody.** A leaked TRADE key can drain/mis-trade the account.
  Mitigated by two-key separation, cron-secret gating, and IP whitelist.
- **Partial fills / exchange errors.** Each tick is independent and retries;
  the drain-balance model self-heals (leftover free balance is picked up next
  minute).
- Existing risk disclaimer (`lib/constants.ts`) still applies and should be kept
  prominent.
