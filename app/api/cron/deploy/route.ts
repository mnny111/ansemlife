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
    const tradeCreds = {
      baseUrl: cfg.asterBaseUrl,
      user: cfg.asterUser,
      signer: trade.tradeSigner,
      privateKey: trade.tradePrivateKey,
    };
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
      { baseUrl: cfg.asterBaseUrl, user: cfg.asterUser, signer: cfg.asterSigner, privateKey: cfg.asterPrivateKey },
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
