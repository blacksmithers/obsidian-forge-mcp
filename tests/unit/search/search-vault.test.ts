import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleSearchVault } from "../../../src/tool-handlers.js";

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

describe("handleSearchVault", () => {
  it("finds files by path substring", async () => {
    const result = await handleSearchVault(vault, vaultPath, {
      query: "sample",
      limit: 10,
    });
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.results[0].path).toBe("00-Inbox/sample-note.md");
  });

  it("respects limit", async () => {
    const result = await handleSearchVault(vault, vaultPath, {
      query: "note",
      limit: 2,
    });
    const data = parseResult(result);
    expect(data.count).toBeLessThanOrEqual(2);
    expect(data.results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty for no match", async () => {
    const result = await handleSearchVault(vault, vaultPath, {
      query: "zzz-nonexistent-zzz",
      limit: 10,
    });
    const data = parseResult(result);
    expect(data.count).toBe(0);
    expect(data.results).toEqual([]);
  });

  it("case-insensitive", async () => {
    const result = await handleSearchVault(vault, vaultPath, {
      query: "SAMPLE",
      limit: 10,
    });
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.results[0].path).toBe("00-Inbox/sample-note.md");
  });

  it("returns path, size, modified", async () => {
    const result = await handleSearchVault(vault, vaultPath, {
      query: "sample",
      limit: 10,
    });
    const data = parseResult(result);
    const entry = data.results[0];
    expect(entry).toHaveProperty("path");
    expect(entry).toHaveProperty("size");
    expect(entry).toHaveProperty("modified");
    expect(typeof entry.path).toBe("string");
    expect(typeof entry.size).toBe("number");
    expect(typeof entry.modified).toBe("string");
  });
});
