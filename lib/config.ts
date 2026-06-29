export type AppConfig = {
  coinMint: string; rewardWallet: string; targetTokenPair: string; solanaRpcUrl: string;
  asterBaseUrl: string; asterApiKey: string; asterApiSecret: string; asterSymbol: string;
  cronSecret: string; kvUrl: string; kvToken: string;
};

const KEYS: Record<keyof AppConfig, string> = {
  coinMint: "ANSEMLIFE_COIN_MINT", rewardWallet: "REWARD_WALLET_ADDRESS",
  targetTokenPair: "TARGET_TOKEN_PAIR", solanaRpcUrl: "SOLANA_RPC_URL",
  asterBaseUrl: "ASTER_BASE_URL", asterApiKey: "ASTER_API_KEY",
  asterApiSecret: "ASTER_API_SECRET", asterSymbol: "ASTER_SYMBOL",
  cronSecret: "CRON_SECRET", kvUrl: "KV_REST_API_URL", kvToken: "KV_REST_API_TOKEN",
};

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const missing: string[] = [];
  const out = {} as AppConfig;
  for (const [field, envKey] of Object.entries(KEYS) as [keyof AppConfig, string][]) {
    const v = env[envKey];
    if (!v) missing.push(envKey);
    else out[field] = v;
  }
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  return out;
}
