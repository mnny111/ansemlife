import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { vercelKv } from "@/lib/kv";
import { getHistory } from "@/lib/store";
import { summarize } from "@/lib/position";
import { fetchAsterPosition } from "@/lib/aster";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = loadConfig(process.env);
    const history = await getHistory(vercelKv);
    const summary = summarize(history);
    let live = summary.latest;
    let liveError: string | null = null;
    try {
      live = await fetchAsterPosition(
        { baseUrl: cfg.asterBaseUrl, user: cfg.asterUser, signer: cfg.asterSigner, privateKey: cfg.asterPrivateKey },
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
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "position read failed" }, { status: 502 });
  }
}
