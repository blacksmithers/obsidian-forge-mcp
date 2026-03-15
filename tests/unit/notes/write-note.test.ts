import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleWriteNote, handleReadNote } from "../../../src/tool-handlers.js";

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

describe("handleWriteNote", () => {
  it("creates new note", async () => {
    const result = await handleWriteNote(vault, vaultPath, {
      path: "notes/brand-new.md",
      content: "# Brand New\n\nFresh content.",
      overwrite: false,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("OK");

    const onDisk = await readVaultFile(vaultPath, "notes/brand-new.md");
    expect(onDisk).toBe("# Brand New\n\nFresh content.");
  });

  it("refuses to overwrite without flag", async () => {
    const result = await handleWriteNote(vault, vaultPath, {
      path: "notes/target-note.md",
      content: "overwritten",
      overwrite: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already exists");
  });

  it("overwrites with overwrite=true", async () => {
    const result = await handleWriteNote(vault, vaultPath, {
      path: "notes/target-note.md",
      content: "# Overwritten Content",
      overwrite: true,
    });
    expect(result.isError).toBeUndefined();

    const onDisk = await readVaultFile(vaultPath, "notes/target-note.md");
    expect(onDisk).toBe("# Overwritten Content");
  });

  it("creates parent directories", async () => {
    const result = await handleWriteNote(vault, vaultPath, {
      path: "deep/nested/dir/new-note.md",
      content: "# Deep Note",
      overwrite: false,
    });
    expect(result.isError).toBeUndefined();

    const onDisk = await readVaultFile(vaultPath, "deep/nested/dir/new-note.md");
    expect(onDisk).toBe("# Deep Note");
  });

  it("auto-appends .md extension", async () => {
    const result = await handleWriteNote(vault, vaultPath, {
      path: "notes/auto-ext",
      content: "# Auto Extension",
      overwrite: false,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("auto-ext.md");

    const onDisk = await readVaultFile(vaultPath, "notes/auto-ext.md");
    expect(onDisk).toBe("# Auto Extension");
  });

  it("handles unicode content", async () => {
    const unicodeContent = "# Unicode\n\n日本語テスト\nКириллица\n中文测试\n🎵🎶🎹";
    const result = await handleWriteNote(vault, vaultPath, {
      path: "notes/unicode-test.md",
      content: unicodeContent,
      overwrite: false,
    });
    expect(result.isError).toBeUndefined();

    const onDisk = await readVaultFile(vaultPath, "notes/unicode-test.md");
    expect(onDisk).toBe(unicodeContent);
  });
});
