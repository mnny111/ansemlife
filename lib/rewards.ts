import { Connection, PublicKey } from "@solana/web3.js";

export type RewardsSummary = { lamports: number; sol: number };

const LAMPORTS_PER_SOL = 1_000_000_000;

async function defaultGetBalance(rpcUrl: string, wallet: string): Promise<number> {
  const conn = new Connection(rpcUrl, "confirmed");
  return conn.getBalance(new PublicKey(wallet));
}

export async function fetchRewardsBalance(
  rpcUrl: string,
  wallet: string,
  getBalanceImpl: (rpcUrl: string, wallet: string) => Promise<number> = defaultGetBalance,
): Promise<RewardsSummary> {
  const lamports = await getBalanceImpl(rpcUrl, wallet);
  if (!Number.isFinite(lamports) || lamports < 0) throw new Error("Invalid balance from RPC");
  return { lamports, sol: lamports / LAMPORTS_PER_SOL };
}
