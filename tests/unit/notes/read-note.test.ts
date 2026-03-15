import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleReadNote } from "../../../src/tool-handlers.js";

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

describe("handleReadNote", () => {
  it("reads existing note by exact path", async () => {
    const result = await handleReadNote(vault, vaultPath, { path: "00-Inbox/sample-note.md" });
    const data = parseResult(result);
    expect(data.path).toBe("00-Inbox/sample-note.md");
    expect(data.content).toContain("# Sample Note");
  });

  it("reads via stem name", async () => {
    const result = await handleReadNote(vault, vaultPath, { path: "sample-note" });
    const data = parseResult(result);
    expect(data.path).toBe("00-Inbox/sample-note.md");
    expect(data.content).toContain("Sample Note");
  });

  it("reads via partial path", async () => {
    const result = await handleReadNote(vault, vaultPath, { path: "notes/target-note" });
    const data = parseResult(result);
    expect(data.path).toBe("notes/target-note.md");
    expect(data.content).toContain("This is the target note");
  });

  it("returns content and metadata", async () => {
    const result = await handleReadNote(vault, vaultPath, { path: "notes/target-note.md" });
    const data = parseResult(result);
    expect(data).toHaveProperty("path");
    expect(data).toHaveProperty("size");
    expect(data).toHaveProperty("mtime");
    expect(data).toHaveProperty("content");
    expect(typeof data.size).toBe("number");
    expect(data.size).toBeGreaterThan(0);
  });

  it("returns error for missing file", async () => {
    const result = await handleReadNote(vault, vaultPath, { path: "nonexistent/file.md" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ERROR");
  });

  it("handles file with frontmatter correctly", async () => {
    const result = await handleReadNote(vault, vaultPath, { path: "notes/note-with-frontmatter.md" });
    const data = parseResult(result);
    expect(data.content).toContain("title: Frontmatter Test");
    expect(data.content).toContain("tags: [test, metadata]");
    expect(data.content).toContain("status: draft");
    expect(data.content).toContain("priority: 3");
    expect(data.content).toContain("# Frontmatter Test");
  });

  it("reads note with special characters in content", async () => {
    await writeVaultFile(vaultPath, "notes/special-chars.md", "# Special\n\nÉmoji: 🎉 & <html> \"quotes\" 'single'\nLine with $dollars$ and {braces}");
    // Re-index to pick up new file
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleReadNote(vault, vaultPath, { path: "notes/special-chars.md" });
    const data = parseResult(result);
    expect(data.content).toContain("Émoji: 🎉");
    expect(data.content).toContain("<html>");
    expect(data.content).toContain("\"quotes\"");
    expect(data.content).toContain("$dollars$");
  });
});
