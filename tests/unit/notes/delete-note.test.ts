import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleDeleteNote, handleReadNote } from "../../../src/tool-handlers.js";

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

describe("handleDeleteNote", () => {
  it("moves to .trash by default", async () => {
    // Create a disposable note
    await writeVaultFile(vaultPath, "notes/to-trash.md", "# Trash Me");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "notes/to-trash.md",
      permanent: false,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("moved to .trash");

    // Original should be gone
    expect(existsSync(path.join(vaultPath, "notes/to-trash.md"))).toBe(false);

    // Should exist in .trash
    const trashed = await readVaultFile(vaultPath, ".trash/to-trash.md");
    expect(trashed).toBe("# Trash Me");
  });

  it("permanently deletes with permanent=true", async () => {
    await writeVaultFile(vaultPath, "notes/perm-delete.md", "# Delete Forever");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "notes/perm-delete.md",
      permanent: true,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("permanent");
    expect(existsSync(path.join(vaultPath, "notes/perm-delete.md"))).toBe(false);
  });

  it("file no longer readable after delete", async () => {
    await writeVaultFile(vaultPath, "notes/gone-after.md", "# Will Be Gone");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    await handleDeleteNote(vault, vaultPath, {
      path: "notes/gone-after.md",
      permanent: true,
    });

    // Re-index so vault is aware of the deletion
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const readResult = await handleReadNote(vault, vaultPath, { path: "notes/gone-after.md" });
    expect(readResult.isError).toBe(true);
    expect(readResult.content[0].text).toContain("ERROR");
  });

  it("returns error for missing file", async () => {
    const result = await handleDeleteNote(vault, vaultPath, {
      path: "nonexistent/no-file.md",
      permanent: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ERROR");
  });

  it("trash directory is created if needed", async () => {
    // Use a fresh vault to ensure no .trash exists yet
    const freshPath = await createTempVault();
    const freshVault = await createVaultIndex(freshPath);

    // Confirm .trash does not exist
    expect(existsSync(path.join(freshPath, ".trash"))).toBe(false);

    await writeVaultFile(freshPath, "notes/trash-test.md", "# Trash Dir Test");
    freshVault.destroy();
    const reindexed = await createVaultIndex(freshPath);

    const result = await handleDeleteNote(reindexed, freshPath, {
      path: "notes/trash-test.md",
      permanent: false,
    });
    expect(result.isError).toBeUndefined();

    // .trash should now exist with the file
    expect(existsSync(path.join(freshPath, ".trash"))).toBe(true);
    expect(existsSync(path.join(freshPath, ".trash/trash-test.md"))).toBe(true);

    reindexed.destroy();
    await cleanupTempVault(freshPath);
  });
});
