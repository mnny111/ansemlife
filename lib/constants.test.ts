import { describe, it, expect } from "vitest";
import { LEVERAGE, DEPLOY_FRACTION, MIN_DEPLOY_USD, PRICE_GUARD_PCT, PRICE_GUARD_WINDOW_MIN } from "./constants";

describe("deploy constants", () => {
  it("has the agreed defaults", () => {
    expect(LEVERAGE).toBe(10);
    expect(DEPLOY_FRACTION).toBe(0.95);
    expect(MIN_DEPLOY_USD).toBe(10);
    expect(PRICE_GUARD_PCT).toBe(3);
    expect(PRICE_GUARD_WINDOW_MIN).toBe(5);
  });
});
