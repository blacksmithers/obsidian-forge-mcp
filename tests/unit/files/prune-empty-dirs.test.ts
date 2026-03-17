import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createTempVault, cleanupTempVault, createVaultIndex, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handlePruneEmptyDirs } from "../../../src/tools/files/prune-empty-dirs.js";

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

let vaultPath: string;
let vault: VaultIndex;

beforeAll(async () => {
  vaultPath = await createTempVault();
  // Create some empty dirs
  await mkdir(path.join(vaultPath, "empty-a"), { recursive: true });
  await mkdir(path.join(vaultPath, "empty-b"), { recursive: true });
  await mkdir(path.join(vaultPath, "empty-c"), { recursive: true });
  // Create nested empty dirs (only empty subdirs)
  await mkdir(path.join(vaultPath, "nested/sub1/deep"), { recursive: true });
  await mkdir(path.join(vaultPath, "nested/sub2"), { recursive: true });
  // Create a dir with actual content
  await writeVaultFile(vaultPath, "has-content/note.md", "# Content");
  vault = await createVaultIndex(vaultPath);
});

afterAll(async () => {
  vault.destroy();
  await cleanupTempVault(vaultPath);
});

describe("handlePruneEmptyDirs", () => {
  it("dry_run finds empty directories without deleting", async () => {
    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: true,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(result);
    expect(data.dry_run).toBe(true);
    expect(data.deleted).toBe(0);
    expect(data.empty_found).toBeGreaterThanOrEqual(3);

    const paths = data.directories.map((d: any) => d.path);
    expect(paths).toContain("empty-a");
    expect(paths).toContain("empty-b");
    expect(paths).toContain("empty-c");
    // Should not include dirs with content
    expect(paths).not.toContain("has-content");

    // Directories should still exist
    expect(existsSync(path.join(vaultPath, "empty-a"))).toBe(true);
  });

  it("execute mode deletes empty directories", async () => {
    // Create fresh empty dirs for this test
    await mkdir(path.join(vaultPath, "exec-empty-1"), { recursive: true });
    await mkdir(path.join(vaultPath, "exec-empty-2"), { recursive: true });
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: false,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(result);
    expect(data.dry_run).toBe(false);
    expect(data.deleted).toBeGreaterThan(0);

    // These should be gone
    expect(existsSync(path.join(vaultPath, "exec-empty-1"))).toBe(false);
    expect(existsSync(path.join(vaultPath, "exec-empty-2"))).toBe(false);
  });

  it("handles nested empty dirs with bottom-up pruning", async () => {
    await mkdir(path.join(vaultPath, "cascade/a/b/c"), { recursive: true });
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: false,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(result);
    expect(existsSync(path.join(vaultPath, "cascade"))).toBe(false);

    // Check that deeper paths appear before shallower in the list
    const paths = data.directories.map((d: any) => d.path);
    const cascadeEntries = paths.filter((p: string) => p.startsWith("cascade"));
    if (cascadeEntries.length > 1) {
      // Deepest first
      const depths = cascadeEntries.map((p: string) => p.split("/").length);
      for (let i = 1; i < depths.length; i++) {
        expect(depths[i]).toBeLessThanOrEqual(depths[i - 1]);
      }
    }
  });

  it("directory with only empty subdirs is also pruned (cascading)", async () => {
    await mkdir(path.join(vaultPath, "parent-of-empties/child1"), { recursive: true });
    await mkdir(path.join(vaultPath, "parent-of-empties/child2"), { recursive: true });
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: false,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(result);
    const paths = data.directories.map((d: any) => d.path);
    expect(paths).toContain("parent-of-empties");
    expect(existsSync(path.join(vaultPath, "parent-of-empties"))).toBe(false);
  });

  it("excluded dirs are never pruned even if empty", async () => {
    // Templates is excluded by default
    await mkdir(path.join(vaultPath, "Templates"), { recursive: true });
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: true,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(result);
    const paths = data.directories.map((d: any) => d.path);
    expect(paths).not.toContain("Templates");
  });

  it("prunes dirs containing only excluded subdirs", async () => {
    await mkdir(path.join(vaultPath, "legacy/.obsidian"), { recursive: true });
    await writeVaultFile(vaultPath, "legacy/.obsidian/app.json", '{"stale": true}');
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Dry run should identify it as prunable
    const dryResult = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: true,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });
    const dryData = parseResult(dryResult);
    const dryPaths = dryData.directories.map((d: any) => d.path);
    expect(dryPaths).toContain("legacy");
    const legacyEntry = dryData.directories.find((d: any) => d.path === "legacy");
    expect(legacyEntry.reason).toContain("excluded directories");

    // Execute mode should delete it
    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: false,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });
    const data = parseResult(result);
    expect(data.deleted).toBeGreaterThan(0);
    expect(existsSync(path.join(vaultPath, "legacy"))).toBe(false);
  });

  it("never prunes vault root even if only excluded dirs", async () => {
    // The vault root always has .obsidian/ — it must never appear in results
    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: ".",
      dry_run: true,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });
    const data = parseResult(result);
    const paths = data.directories.map((d: any) => d.path);
    expect(paths).not.toContain(".");
  });

  it("scans from a specific subdirectory", async () => {
    await mkdir(path.join(vaultPath, "scoped/empty-sub"), { recursive: true });
    await writeVaultFile(vaultPath, "scoped/has-file.md", "# File");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handlePruneEmptyDirs(vault, vaultPath, {
      path: "scoped",
      dry_run: true,
      exclude: [".obsidian", ".vaultforge", ".trash", ".git", "Templates"],
    });

    const data = parseResult(result);
    expect(data.empty_found).toBeGreaterThanOrEqual(1);
    const paths = data.directories.map((d: any) => d.path);
    expect(paths).toContain("scoped/empty-sub");
  });
});
