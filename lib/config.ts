export type AppConfig = {
  coinMint: string; rewardWallet: string; targetTokenPair: string; solanaRpcUrl: string;
  asterBaseUrl: string; asterUser: string; asterSigner: string; asterPrivateKey: string;
  asterSymbol: string; cronSecret: string; kvUrl: string; kvToken: string;
};

const KEYS: Record<keyof AppConfig, string> = {
  coinMint: "ANSEMLIFE_COIN_MINT", rewardWallet: "REWARD_WALLET_ADDRESS",
  targetTokenPair: "TARGET_TOKEN_PAIR", solanaRpcUrl: "SOLANA_RPC_URL",
  asterBaseUrl: "ASTER_BASE_URL",
  asterUser: "ASTER_USER_ADDRESS",         // main account / login wallet
  asterSigner: "ASTER_SIGNER_ADDRESS",     // read-only API wallet address
  asterPrivateKey: "ASTER_PRIVATE_KEY",    // read-only API wallet private key
  asterSymbol: "ASTER_SYMBOL",
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

// Trade (Perps-enabled) API wallet. The main account address comes from AppConfig.asterUser.
export type TradeConfig = { tradeSigner: string; tradePrivateKey: string };

const TRADE_KEYS: Record<keyof TradeConfig, string> = {
  tradeSigner: "ASTER_TRADE_SIGNER_ADDRESS",
  tradePrivateKey: "ASTER_TRADE_PRIVATE_KEY",
};

export function loadTradeConfig(env: Record<string, string | undefined>): TradeConfig {
  const missing: string[] = [];
  const out = {} as TradeConfig;
  for (const [field, envKey] of Object.entries(TRADE_KEYS) as [keyof TradeConfig, string][]) {
    const v = env[envKey];
    if (!v) missing.push(envKey);
    else out[field] = v;
  }
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  return out;
}
