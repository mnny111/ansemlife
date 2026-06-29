import { describe, it, expect } from "vitest";
import { usd, sol } from "./format";

describe("formatters", () => {
  it("formats usd", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(null)).toBe("—");
  });
  it("formats sol", () => {
    expect(sol(2.5)).toBe("2.5000 SOL");
  });
});
