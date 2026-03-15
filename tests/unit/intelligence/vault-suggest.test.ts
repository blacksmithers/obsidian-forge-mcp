import { describe, it, expect } from "vitest";
import { registerVaultSuggest } from "../../../src/tools/intelligence/vault-suggest.js";

describe("vault-suggest", () => {
  it("module exports registerVaultSuggest function", () => {
    expect(registerVaultSuggest).toBeDefined();
  });

  it("registerVaultSuggest is a function", () => {
    expect(typeof registerVaultSuggest).toBe("function");
  });
});
