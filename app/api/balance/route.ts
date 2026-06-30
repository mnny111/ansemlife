import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { fetchAccountBalance } from "@/lib/aster";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = loadConfig(process.env);
    const balance = await fetchAccountBalance({
      baseUrl: cfg.asterBaseUrl,
      user: cfg.asterUser,
      signer: cfg.asterSigner,
      privateKey: cfg.asterPrivateKey,
    });
    return NextResponse.json(balance);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "balance read failed" }, { status: 502 });
  }
}
