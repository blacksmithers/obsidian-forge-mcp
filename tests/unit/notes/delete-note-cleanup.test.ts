import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { createTempVault, cleanupTempVault, createVaultIndex, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleDeleteNote, cleanupEmptyParents } from "../../../src/tool-handlers.js";

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

describe("cleanup_empty_parents on delete_note", () => {
  it("deletes last file and cleans up empty parents", async () => {
    await writeVaultFile(vaultPath, "deep/nested/path/file.md", "# Content");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "deep/nested/path/file.md",
      permanent: true,
      cleanup_empty_parents: true,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Cleaned");
    // All empty parents should be removed
    expect(existsSync(path.join(vaultPath, "deep/nested/path"))).toBe(false);
    expect(existsSync(path.join(vaultPath, "deep/nested"))).toBe(false);
    expect(existsSync(path.join(vaultPath, "deep"))).toBe(false);
  });

  it("stops at non-empty parent", async () => {
    await writeVaultFile(vaultPath, "parent/keep-me.md", "# Stay");
    await writeVaultFile(vaultPath, "parent/child/remove.md", "# Go");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "parent/child/remove.md",
      permanent: true,
      cleanup_empty_parents: true,
    });

    expect(result.isError).toBeUndefined();
    // child/ should be removed
    expect(existsSync(path.join(vaultPath, "parent/child"))).toBe(false);
    // parent/ should still exist (has keep-me.md)
    expect(existsSync(path.join(vaultPath, "parent/keep-me.md"))).toBe(true);
    expect(existsSync(path.join(vaultPath, "parent"))).toBe(true);
  });

  it("does not clean up when cleanup_empty_parents is false", async () => {
    await writeVaultFile(vaultPath, "no-cleanup/only-file.md", "# Content");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "no-cleanup/only-file.md",
      permanent: true,
      cleanup_empty_parents: false,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain("Cleaned");
    // Directory should still exist even though empty
    expect(existsSync(path.join(vaultPath, "no-cleanup"))).toBe(true);
  });

  it("cleanup stops at vault root", async () => {
    await writeVaultFile(vaultPath, "root-child.md", "# Root level");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "root-child.md",
      permanent: true,
      cleanup_empty_parents: true,
    });

    expect(result.isError).toBeUndefined();
    // Vault root must still exist
    expect(existsSync(vaultPath)).toBe(true);
  });

  it("cleanup skips protected directories", async () => {
    // cleanupEmptyParents should not try to delete .obsidian or .git parents
    const cleaned = await cleanupEmptyParents(vault, vaultPath, ".obsidian/sub");
    expect(cleaned).toHaveLength(0);

    const cleaned2 = await cleanupEmptyParents(vault, vaultPath, ".git/refs");
    expect(cleaned2).toHaveLength(0);
  });

  it("works with trash mode (permanent: false)", async () => {
    await writeVaultFile(vaultPath, "trash-cleanup/sub/note.md", "# Trash");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "trash-cleanup/sub/note.md",
      permanent: false,
      cleanup_empty_parents: true,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("moved to .trash");
    expect(result.content[0].text).toContain("Cleaned");
    expect(existsSync(path.join(vaultPath, "trash-cleanup/sub"))).toBe(false);
    expect(existsSync(path.join(vaultPath, "trash-cleanup"))).toBe(false);
  });
});
