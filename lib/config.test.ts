import { describe, it, expect } from "vitest";
import { loadConfig, loadTradeConfig } from "./config";

const full = {
  ANSEMLIFE_COIN_MINT: "mint", REWARD_WALLET_ADDRESS: "wallet",
  TARGET_TOKEN_PAIR: "pair", SOLANA_RPC_URL: "https://rpc",
  ASTER_BASE_URL: "https://fapi3.asterdex.com",
  ASTER_USER_ADDRESS: "0xuser", ASTER_SIGNER_ADDRESS: "0xsigner", ASTER_PRIVATE_KEY: "0xkey",
  ASTER_SYMBOL: "ANSEMUSDT", CRON_SECRET: "cs",
  KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "tok",
};

describe("loadConfig", () => {
  it("maps env to AppConfig", () => {
    const cfg = loadConfig(full);
    expect(cfg.rewardWallet).toBe("wallet");
    expect(cfg.asterSymbol).toBe("ANSEMUSDT");
    expect(cfg.asterSigner).toBe("0xsigner");
    expect(cfg.cronSecret).toBe("cs");
  });
  it("throws listing every missing key", () => {
    expect(() => loadConfig({})).toThrow(/ANSEMLIFE_COIN_MINT/);
    expect(() => loadConfig({ ...full, ASTER_PRIVATE_KEY: "" })).toThrow(/ASTER_PRIVATE_KEY/);
  });
});

describe("loadTradeConfig", () => {
  it("loads the trade API wallet", () => {
    expect(loadTradeConfig({ ASTER_TRADE_SIGNER_ADDRESS: "0xts", ASTER_TRADE_PRIVATE_KEY: "0xtk" })).toEqual({
      tradeSigner: "0xts",
      tradePrivateKey: "0xtk",
    });
  });
  it("throws listing missing vars", () => {
    expect(() => loadTradeConfig({})).toThrow(/ASTER_TRADE_SIGNER_ADDRESS/);
    expect(() => loadTradeConfig({ ASTER_TRADE_SIGNER_ADDRESS: "0xts" })).toThrow(/ASTER_TRADE_PRIVATE_KEY/);
  });
});
