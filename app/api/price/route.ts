import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { fetchTokenPrice } from "@/lib/price";

export const dynamic = "force-dynamic";
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
