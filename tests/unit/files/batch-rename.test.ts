import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";

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

describe("batch-rename VaultIndex resolve", () => {
  it("vault.resolve finds files by stem", () => {
    const entry = vault.resolve("sample-note");
    expect(entry).toBeDefined();
    expect(entry!.rel).toBe("00-Inbox/sample-note.md");
  });

  it("vault.resolve returns undefined for non-existent files", () => {
    const entry = vault.resolve("this-file-does-not-exist-anywhere");
    expect(entry).toBeUndefined();
  });

  it("vault.resolve finds files by exact path", () => {
    const entry = vault.resolve("notes/target-note.md");
    expect(entry).toBeDefined();
    expect(entry!.rel).toBe("notes/target-note.md");
  });

  it("vault.resolve tries adding .md extension", () => {
    const entry = vault.resolve("notes/target-note");
    expect(entry).toBeDefined();
    expect(entry!.rel).toBe("notes/target-note.md");
  });

  it("vault.resolve finds canvas files by exact path", () => {
    const entry = vault.resolve("canvas/test-canvas.canvas");
    expect(entry).toBeDefined();
    expect(entry!.rel).toBe("canvas/test-canvas.canvas");
  });
});
