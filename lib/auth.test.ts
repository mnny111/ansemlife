import { describe, it, expect } from "vitest";
import { verifyBearer } from "./auth";

describe("verifyBearer", () => {
  it("accepts exact bearer token", () => expect(verifyBearer("Bearer s3cret", "s3cret")).toBe(true));
  it("rejects wrong token", () => expect(verifyBearer("Bearer nope", "s3cret")).toBe(false));
  it("rejects missing header", () => expect(verifyBearer(null, "s3cret")).toBe(false));
  it("rejects wrong scheme", () => expect(verifyBearer("Basic s3cret", "s3cret")).toBe(false));
  it("rejects empty expected", () => expect(verifyBearer("Bearer ", "")).toBe(false));
});
