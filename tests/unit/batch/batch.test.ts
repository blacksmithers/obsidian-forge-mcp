import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import {
  handleReadNote,
  handleWriteNote,
  handleEditNote,
  handleDeleteNote,
} from "../../../src/tool-handlers.js";

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

describe("batch tool handlers", () => {
  it("handleReadNote then handleEditNote pipeline works", async () => {
    // Read existing note
    const readResult = await handleReadNote(vault, vaultPath, { path: "notes/target-note.md" });
    const data = parseResult(readResult);
    expect(data.content).toContain("This is the target note");

    // Edit it
    const editResult = await handleEditNote(vault, vaultPath, {
      path: "notes/target-note.md",
      old_str: "This is the target note",
      new_str: "This is the edited target note",
    });
    expect(editResult.isError).toBeUndefined();
    expect(editResult.content[0].text).toContain("OK");

    // Verify edit
    const verifyResult = await handleReadNote(vault, vaultPath, { path: "notes/target-note.md" });
    const verified = parseResult(verifyResult);
    expect(verified.content).toContain("This is the edited target note");
  });

  it("handleWriteNote then handleReadNote returns written content", async () => {
    const writeResult = await handleWriteNote(vault, vaultPath, {
      path: "notes/batch-test-new.md",
      content: "# Batch Test\n\nCreated via batch handler test.",
      overwrite: false,
    });
    expect(writeResult.content[0].text).toContain("OK");

    // Wait for index to pick up the file
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const readResult = await handleReadNote(vault, vaultPath, { path: "notes/batch-test-new.md" });
    const data = parseResult(readResult);
    expect(data.content).toContain("# Batch Test");
    expect(data.content).toContain("Created via batch handler test.");
  });

  it("handleWriteNote refuses overwrite", async () => {
    // File already exists from previous test
    const writeResult = await handleWriteNote(vault, vaultPath, {
      path: "notes/batch-test-new.md",
      content: "Overwritten content",
      overwrite: false,
    });
    expect(writeResult.isError).toBe(true);
    expect(writeResult.content[0].text).toContain("already exists");
  });

  it("handleDeleteNote then handleReadNote returns error", async () => {
    // Write a file to delete
    await handleWriteNote(vault, vaultPath, {
      path: "notes/to-delete.md",
      content: "# To Delete\n\nThis file will be deleted.",
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Delete it
    const deleteResult = await handleDeleteNote(vault, vaultPath, {
      path: "notes/to-delete.md",
      permanent: true,
    });
    expect(deleteResult.content[0].text).toContain("OK");

    // Reading should fail
    const readResult = await handleReadNote(vault, vaultPath, { path: "notes/to-delete.md" });
    expect(readResult.isError).toBe(true);
    expect(readResult.content[0].text).toContain("ERROR");
  });

  it("multiple operations in sequence", async () => {
    // Write
    const w = await handleWriteNote(vault, vaultPath, {
      path: "notes/sequence-test.md",
      content: "# Sequence\n\nOriginal content.",
      overwrite: false,
    });
    expect(w.content[0].text).toContain("OK");

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Edit
    const e = await handleEditNote(vault, vaultPath, {
      path: "notes/sequence-test.md",
      old_str: "Original content.",
      new_str: "Modified content.",
    });
    expect(e.content[0].text).toContain("OK");

    // Read and verify
    const r = await handleReadNote(vault, vaultPath, { path: "notes/sequence-test.md" });
    const data = parseResult(r);
    expect(data.content).toContain("Modified content.");
    expect(data.content).not.toContain("Original content.");

    // Delete
    const d = await handleDeleteNote(vault, vaultPath, {
      path: "notes/sequence-test.md",
      permanent: true,
    });
    expect(d.content[0].text).toContain("OK");
  });
});
