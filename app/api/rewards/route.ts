import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { fetchRewardsBalance } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = loadConfig(process.env);
    const r = await fetchRewardsBalance(cfg.solanaRpcUrl, cfg.rewardWallet);
    return NextResponse.json({ ...r, wallet: cfg.rewardWallet });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "rewards read failed" }, { status: 502 });
  }
}
