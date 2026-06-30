import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { vercelKv } from "@/lib/kv";
import { appendSnapshot } from "@/lib/store";
import { fetchAsterPosition } from "@/lib/aster";
import { verifyBearer } from "@/lib/auth";

async function runSnapshot(req: Request): Promise<Response> {
  const cfg = loadConfig(process.env);
  if (!verifyBearer(req.headers.get("authorization"), cfg.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await fetchAsterPosition(
      { baseUrl: cfg.asterBaseUrl, user: cfg.asterUser, signer: cfg.asterSigner, privateKey: cfg.asterPrivateKey },
      cfg.asterSymbol,
    );
    await appendSnapshot(vercelKv, snapshot);
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "snapshot failed" }, { status: 502 });
  }
}

export async function GET(req: Request) {
  return runSnapshot(req);
}

export async function POST(req: Request) {
  return runSnapshot(req);
}
