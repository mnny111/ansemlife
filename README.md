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
