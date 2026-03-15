import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleAppendNote } from "../../../src/tool-handlers.js";

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

describe("handleAppendNote", () => {
  it("appends to existing file", async () => {
    const originalContent = await readVaultFile(vaultPath, "notes/target-note.md");

    const result = await handleAppendNote(vault, vaultPath, {
      path: "notes/target-note.md",
      content: "Appended line.",
      separator: "\n\n",
      create_if_missing: false,
      add_timestamp: false,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("OK");

    const updated = await readVaultFile(vaultPath, "notes/target-note.md");
    expect(updated).toBe(originalContent + "\n\nAppended line.");
  });

  it("creates file if missing with create_if_missing", async () => {
    const result = await handleAppendNote(vault, vaultPath, {
      path: "new-subdir/created-by-append.md",
      content: "# Created via append",
      separator: "\n",
      create_if_missing: true,
      add_timestamp: false,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Created");

    const onDisk = await readVaultFile(vaultPath, "new-subdir/created-by-append.md");
    expect(onDisk).toBe("# Created via append");
  });

  it("returns error if missing and create_if_missing=false", async () => {
    const result = await handleAppendNote(vault, vaultPath, {
      path: "nonexistent/no-create.md",
      content: "should fail",
      separator: "\n",
      create_if_missing: false,
      add_timestamp: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ERROR");
  });

  it("respects custom separator", async () => {
    const originalContent = await readVaultFile(vaultPath, "notes/linked-note.md");

    const result = await handleAppendNote(vault, vaultPath, {
      path: "notes/linked-note.md",
      content: "Custom separated content.",
      separator: "\n---\n",
      create_if_missing: false,
      add_timestamp: false,
    });
    expect(result.isError).toBeUndefined();

    const updated = await readVaultFile(vaultPath, "notes/linked-note.md");
    expect(updated).toBe(originalContent + "\n---\nCustom separated content.");
  });

  it("adds timestamp when requested", async () => {
    const result = await handleAppendNote(vault, vaultPath, {
      path: "00-Inbox/sample-note.md",
      content: "Timestamped entry.",
      separator: "\n",
      create_if_missing: false,
      add_timestamp: true,
    });
    expect(result.isError).toBeUndefined();

    const updated = await readVaultFile(vaultPath, "00-Inbox/sample-note.md");
    // Timestamp format: <!-- 2026-03-15 12:34:56 -->
    expect(updated).toMatch(/<!-- \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} -->/);
    expect(updated).toContain("Timestamped entry.");
  });
});
