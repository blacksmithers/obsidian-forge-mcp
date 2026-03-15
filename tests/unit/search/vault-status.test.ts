import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleVaultStatus } from "../../../src/tool-handlers.js";

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

let vaultPath: string;
let vault: VaultIndex;

beforeAll(async () => {
  vaultPath = await createTempVault();
  vault = await createVaultIndex(vaultPath);
});

afterAll(async () => {
  vault.destroy();
  await cleanupTempVault(vaultPath);
});

describe("handleVaultStatus", () => {
  it("returns totalFiles count", async () => {
    const result = await handleVaultStatus(vault, vaultPath);
    const data = parseResult(result);
    // 6 .md files + 1 .canvas = 7 files
    expect(data.totalFiles).toBe(7);
  });

  it("returns totalDirs count", async () => {
    const result = await handleVaultStatus(vault, vaultPath);
    const data = parseResult(result);
    // Directories: 00-Inbox, 01-Daily, notes, canvas, plus root "."
    expect(data.totalDirs).toBeGreaterThanOrEqual(4);
  });

  it("returns extension breakdown", async () => {
    const result = await handleVaultStatus(vault, vaultPath);
    const data = parseResult(result);
    expect(data.extensions).toBeDefined();
    expect(data.extensions[".md"]).toBe(6);
    expect(data.extensions[".canvas"]).toBe(1);
  });

  it("returns topExtensions sorted by count", async () => {
    const result = await handleVaultStatus(vault, vaultPath);
    const data = parseResult(result);
    expect(data.topExtensions).toBeInstanceOf(Array);
    expect(data.topExtensions.length).toBeGreaterThanOrEqual(2);
    // First entry should be .md with count 6 (highest)
    expect(data.topExtensions[0][0]).toBe(".md");
    expect(data.topExtensions[0][1]).toBe(6);
    // topExtensions should be sorted descending by count
    for (let i = 1; i < data.topExtensions.length; i++) {
      expect(data.topExtensions[i - 1][1]).toBeGreaterThanOrEqual(data.topExtensions[i][1]);
    }
  });
});
