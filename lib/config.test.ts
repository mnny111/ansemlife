import { describe, it, expect } from "vitest";
import { loadConfig, loadTradeConfig } from "./config";

const full = {
  ANSEMLIFE_COIN_MINT: "mint", REWARD_WALLET_ADDRESS: "wallet",
  TARGET_TOKEN_PAIR: "pair", SOLANA_RPC_URL: "https://rpc",
  ASTER_BASE_URL: "https://fapi.asterdex.com", ASTER_API_KEY: "ak",
  ASTER_API_SECRET: "sk", ASTER_SYMBOL: "ANSEMUSDT", CRON_SECRET: "cs",
  KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "tok",
};

describe("loadConfig", () => {
  it("maps env to AppConfig", () => {
    const cfg = loadConfig(full);
    expect(cfg.rewardWallet).toBe("wallet");
    expect(cfg.asterSymbol).toBe("ANSEMUSDT");
    expect(cfg.cronSecret).toBe("cs");
  });
  it("throws listing every missing key", () => {
    expect(() => loadConfig({})).toThrow(/ANSEMLIFE_COIN_MINT/);
    expect(() => loadConfig({ ...full, ASTER_API_SECRET: "" })).toThrow(/ASTER_API_SECRET/);
  });
});

describe("loadTradeConfig", () => {
  it("loads the trade key pair", () => {
    expect(loadTradeConfig({ ASTER_TRADE_API_KEY: "k", ASTER_TRADE_API_SECRET: "s" })).toEqual({
      tradeApiKey: "k",
      tradeApiSecret: "s",
    });
  });
  it("throws listing missing vars", () => {
    expect(() => loadTradeConfig({})).toThrow(/ASTER_TRADE_API_KEY/);
    expect(() => loadTradeConfig({ ASTER_TRADE_API_KEY: "k" })).toThrow(/ASTER_TRADE_API_SECRET/);
  });
});
