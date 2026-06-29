export const RISK_DISCLAIMER =
  "Not financial advice. AnsemLife uses 10x leverage — a roughly 9–10% adverse price move can liquidate the entire position to zero. Creator rewards are variable and not guaranteed. You can lose money. Position data is read live from AsterDex; AsterDex is the source of truth, not a guarantee of outcome.";

// Auto-deploy tunables. Env overrides allow tuning without a redeploy.
const num = (envKey: string, fallback: number): number => {
  const v = process.env[envKey];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const LEVERAGE = num("DEPLOY_LEVERAGE", 10);
export const DEPLOY_FRACTION = num("DEPLOY_FRACTION", 0.95);
export const MIN_DEPLOY_USD = num("MIN_DEPLOY_USD", 10);
export const PRICE_GUARD_PCT = num("PRICE_GUARD_PCT", 3);
export const PRICE_GUARD_WINDOW_MIN = num("PRICE_GUARD_WINDOW_MIN", 5);
