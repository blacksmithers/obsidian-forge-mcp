import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleRecentNotes } from "../../../src/tool-handlers.js";

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

describe("handleRecentNotes", () => {
  it("returns recent files sorted by mtime", async () => {
    const result = await handleRecentNotes(vault, vaultPath, {
      limit: 20,
    });
    const data = parseResult(result);
    expect(data.files.length).toBeGreaterThanOrEqual(1);
  });

  it("more recent files come first", async () => {
    const result = await handleRecentNotes(vault, vaultPath, {
      limit: 20,
    });
    const data = parseResult(result);
    const times = data.files.map((f: any) => new Date(f.modified).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }
  });

  it("respects limit", async () => {
    const result = await handleRecentNotes(vault, vaultPath, {
      limit: 2,
    });
    const data = parseResult(result);
    expect(data.files.length).toBeLessThanOrEqual(2);
    expect(data.count).toBeLessThanOrEqual(2);
  });

  it("filters by extension", async () => {
    const result = await handleRecentNotes(vault, vaultPath, {
      limit: 20,
      extension: ".canvas",
    });
    const data = parseResult(result);
    for (const f of data.files) {
      expect(f.path).toMatch(/\.canvas$/);
    }
    expect(data.count).toBe(1);
  });

  it("returns path, modified, size", async () => {
    const result = await handleRecentNotes(vault, vaultPath, {
      limit: 5,
    });
    const data = parseResult(result);
    expect(data.files.length).toBeGreaterThanOrEqual(1);
    const entry = data.files[0];
    expect(entry).toHaveProperty("path");
    expect(entry).toHaveProperty("modified");
    expect(entry).toHaveProperty("size");
    expect(typeof entry.path).toBe("string");
    expect(typeof entry.modified).toBe("string");
    expect(typeof entry.size).toBe("number");
  });
});
