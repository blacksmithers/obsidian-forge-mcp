import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createTempVault, cleanupTempVault, createVaultIndex, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleDeleteFolder } from "../../../src/tools/files/delete-folder.js";

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

describe("handleDeleteFolder", () => {
  it("deletes an empty directory", async () => {
    await mkdir(path.join(vaultPath, "empty-dir"), { recursive: true });
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "empty-dir",
      recursive: false,
      permanent: true,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.deleted).toBe(true);
    expect(existsSync(path.join(vaultPath, "empty-dir"))).toBe(false);
  });

  it("refuses non-empty directory without recursive", async () => {
    await writeVaultFile(vaultPath, "non-empty-dir/file.md", "# Content");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "non-empty-dir",
      recursive: false,
      permanent: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not empty");
    expect(existsSync(path.join(vaultPath, "non-empty-dir/file.md"))).toBe(true);
  });

  it("deletes non-empty directory with recursive: true", async () => {
    await writeVaultFile(vaultPath, "to-delete/sub/file1.md", "# File 1");
    await writeVaultFile(vaultPath, "to-delete/sub/file2.md", "# File 2");
    await writeVaultFile(vaultPath, "to-delete/file3.md", "# File 3");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "to-delete",
      recursive: true,
      permanent: true,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.deleted).toBe(true);
    expect(data.files_removed).toBeGreaterThanOrEqual(3);
    expect(data.permanent).toBe(true);
    expect(existsSync(path.join(vaultPath, "to-delete"))).toBe(false);
  });

  it("refuses to delete vault root", async () => {
    const result = await handleDeleteFolder(vault, vaultPath, {
      path: ".",
      recursive: true,
      permanent: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("vault root");
  });

  it("refuses to delete .obsidian", async () => {
    const result = await handleDeleteFolder(vault, vaultPath, {
      path: ".obsidian",
      recursive: true,
      permanent: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("protected");
  });

  it("refuses to delete .trash", async () => {
    const result = await handleDeleteFolder(vault, vaultPath, {
      path: ".trash",
      recursive: true,
      permanent: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("protected");
  });

  it("refuses to delete .git", async () => {
    const result = await handleDeleteFolder(vault, vaultPath, {
      path: ".git",
      recursive: true,
      permanent: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("protected");
  });

  it("moves to .trash with permanent: false", async () => {
    await mkdir(path.join(vaultPath, "trash-me-dir"), { recursive: true });
    await writeVaultFile(vaultPath, "trash-me-dir/note.md", "# Note");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "trash-me-dir",
      recursive: true,
      permanent: false,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.permanent).toBe(false);
    expect(existsSync(path.join(vaultPath, "trash-me-dir"))).toBe(false);
    expect(existsSync(path.join(vaultPath, ".trash/trash-me-dir/note.md"))).toBe(true);
  });

  it("permanent: true leaves no trace in .trash", async () => {
    await mkdir(path.join(vaultPath, "perm-delete-dir"), { recursive: true });
    await writeVaultFile(vaultPath, "perm-delete-dir/data.md", "# Data");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "perm-delete-dir",
      recursive: true,
      permanent: true,
    });

    expect(result.isError).toBeUndefined();
    expect(existsSync(path.join(vaultPath, "perm-delete-dir"))).toBe(false);
    expect(existsSync(path.join(vaultPath, ".trash/perm-delete-dir"))).toBe(false);
  });

  it("returns error for non-existent directory", async () => {
    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "does-not-exist",
      recursive: false,
      permanent: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns error when path is a file, not a directory", async () => {
    await writeVaultFile(vaultPath, "just-a-file.md", "# File");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleDeleteFolder(vault, vaultPath, {
      path: "just-a-file.md",
      recursive: false,
      permanent: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Not a directory");
  });
});
