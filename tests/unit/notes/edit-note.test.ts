import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleEditNote } from "../../../src/tool-handlers.js";

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

describe("handleEditNote", () => {
  it("replaces unique string", async () => {
    const result = await handleEditNote(vault, vaultPath, {
      path: "notes/target-note.md",
      old_str: "This is the target note that other notes link to.",
      new_str: "This is the EDITED target note.",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("OK");

    const onDisk = await readVaultFile(vaultPath, "notes/target-note.md");
    expect(onDisk).toContain("This is the EDITED target note.");
    expect(onDisk).not.toContain("This is the target note that other notes link to.");
  });

  it("returns error for missing string", async () => {
    const result = await handleEditNote(vault, vaultPath, {
      path: "notes/target-note.md",
      old_str: "this string does not exist anywhere in the file",
      new_str: "replacement",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("String not found");
  });

  it("returns error for non-unique string (multiple occurrences)", async () => {
    // Write a file with repeated content
    await writeVaultFile(vaultPath, "notes/repeated.md", "apple banana apple cherry apple");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleEditNote(vault, vaultPath, {
      path: "notes/repeated.md",
      old_str: "apple",
      new_str: "orange",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("3 times");
    expect(result.content[0].text).toContain("Must be unique");
  });

  it("handles empty new_str (deletion)", async () => {
    await writeVaultFile(vaultPath, "notes/delete-part.md", "keep this REMOVE THIS keep this too");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleEditNote(vault, vaultPath, {
      path: "notes/delete-part.md",
      old_str: "REMOVE THIS ",
      new_str: "",
    });
    expect(result.isError).toBeUndefined();

    const onDisk = await readVaultFile(vaultPath, "notes/delete-part.md");
    expect(onDisk).toBe("keep this keep this too");
  });

  it("preserves rest of file", async () => {
    await writeVaultFile(vaultPath, "notes/preserve.md", "line1\nline2\nline3\nline4\nline5");
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleEditNote(vault, vaultPath, {
      path: "notes/preserve.md",
      old_str: "line3",
      new_str: "REPLACED",
    });
    expect(result.isError).toBeUndefined();

    const onDisk = await readVaultFile(vaultPath, "notes/preserve.md");
    expect(onDisk).toBe("line1\nline2\nREPLACED\nline4\nline5");
  });

  it("returns error for missing file", async () => {
    const result = await handleEditNote(vault, vaultPath, {
      path: "nonexistent/missing.md",
      old_str: "anything",
      new_str: "something",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ERROR");
  });
});
