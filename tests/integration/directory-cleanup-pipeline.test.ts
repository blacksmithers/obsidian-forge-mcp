import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createTempVault, cleanupTempVault, createVaultIndex, writeVaultFile, readVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";
import { handleDeleteNote } from "../../src/tool-handlers.js";
import { handleDeleteFolder } from "../../src/tools/files/delete-folder.js";
import { handlePruneEmptyDirs } from "../../src/tools/files/prune-empty-dirs.js";

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

describe("Directory cleanup pipeline", () => {
  it("full pipeline: create files → batch delete → prune empty dirs", async () => {
    // Setup: create a directory tree
    await writeVaultFile(vaultPath, "Projetos/ALUPI/spec.md", "# Spec");
    await writeVaultFile(vaultPath, "Projetos/ALUPI/design.md", "# Design");
    await writeVaultFile(vaultPath, "Projetos/BETA/readme.md", "# Beta");
    await writeVaultFile(vaultPath, "Projetos/keep.md", "# Keep this");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Delete all files from ALUPI and BETA subdirs
    await handleDeleteNote(vault, vaultPath, { path: "Projetos/ALUPI/spec.md", permanent: true });
    await handleDeleteNote(vault, vaultPath, { path: "Projetos/ALUPI/design.md", permanent: true });
    await handleDeleteNote(vault, vaultPath, { path: "Projetos/BETA/readme.md", permanent: true });

    // Now prune empty dirs
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const pruneResult = await handlePruneEmptyDirs(vault, vaultPath, {
      path: "Projetos",
      dry_run: false,
      exclude: [".obsidian", ".obsidian-forge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(pruneResult);
    expect(data.deleted).toBeGreaterThanOrEqual(2);
    expect(existsSync(path.join(vaultPath, "Projetos/ALUPI"))).toBe(false);
    expect(existsSync(path.join(vaultPath, "Projetos/BETA"))).toBe(false);
    // Projetos itself should still exist (has keep.md)
    expect(existsSync(path.join(vaultPath, "Projetos/keep.md"))).toBe(true);
  });

  it("delete_note with cleanup_empty_parents in nested structure", async () => {
    // Create a deep nested structure with only one file
    await writeVaultFile(vaultPath, "A/B/C/D/only-file.md", "# Lonely");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteNote(vault, vaultPath, {
      path: "A/B/C/D/only-file.md",
      permanent: true,
      cleanup_empty_parents: true,
    });

    expect(result.isError).toBeUndefined();
    expect(existsSync(path.join(vaultPath, "A"))).toBe(false);
  });

  it("delete_folder with trash moves entire tree to .trash", async () => {
    await writeVaultFile(vaultPath, "archive/old/doc1.md", "# Doc 1");
    await writeVaultFile(vaultPath, "archive/old/doc2.md", "# Doc 2");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "archive",
      recursive: true,
      permanent: false,
    });

    const data = parseResult(result);
    expect(data.deleted).toBe(true);
    expect(existsSync(path.join(vaultPath, "archive"))).toBe(false);
    // Should be in .trash
    expect(existsSync(path.join(vaultPath, ".trash/archive/old/doc1.md"))).toBe(true);
    expect(existsSync(path.join(vaultPath, ".trash/archive/old/doc2.md"))).toBe(true);
  });

  it("prune after recursive folder delete leaves vault clean", async () => {
    await writeVaultFile(vaultPath, "cleanup-test/a/file.md", "# A");
    await mkdir(path.join(vaultPath, "cleanup-test/b"), { recursive: true });
    await mkdir(path.join(vaultPath, "cleanup-test/c/d"), { recursive: true });
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Delete folder with content
    await handleDeleteFolder(vault, vaultPath, {
      path: "cleanup-test/a",
      recursive: true,
      permanent: true,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Prune remaining empty dirs
    const pruneResult = await handlePruneEmptyDirs(vault, vaultPath, {
      path: "cleanup-test",
      dry_run: false,
      exclude: [".obsidian", ".obsidian-forge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(pruneResult);
    expect(data.deleted).toBeGreaterThanOrEqual(2);
    // cleanup-test itself should also be gone (all children empty)
    expect(existsSync(path.join(vaultPath, "cleanup-test"))).toBe(false);
  });
});
