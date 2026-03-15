import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";
import {
  handleReadNote,
  handleWriteNote,
  handleEditNote,
  handleAppendNote,
  handleDeleteNote,
} from "../../src/tool-handlers.js";
import { parseFrontmatter, serializeFrontmatter } from "../../src/tools/metadata/frontmatter.js";

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

describe("CRUD pipeline", () => {
  it("write → read → verify content matches", async () => {
    const content = "# Hello World\n\nThis is a test note.\n";
    await handleWriteNote(vault, vaultPath, {
      path: "crud-test/write-read.md",
      content,
      overwrite: false,
    });

    // Recreate index to pick up the new file
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await handleReadNote(vault, vaultPath, { path: "crud-test/write-read.md" });
    const data = parseResult(result);
    expect(data.content).toBe(content);
    expect(data.path).toBe("crud-test/write-read.md");
  });

  it("write → edit → read → verify edit applied", async () => {
    const original = "# Edit Test\n\nOriginal content here.\n";
    await handleWriteNote(vault, vaultPath, {
      path: "crud-test/edit-test.md",
      content: original,
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    await handleEditNote(vault, vaultPath, {
      path: "crud-test/edit-test.md",
      old_str: "Original content here.",
      new_str: "Edited content here.",
    });

    const result = await handleReadNote(vault, vaultPath, { path: "crud-test/edit-test.md" });
    const data = parseResult(result);
    expect(data.content).toContain("Edited content here.");
    expect(data.content).not.toContain("Original content here.");
  });

  it("write → append → read → verify append applied", async () => {
    const original = "# Append Test\n\nBase content.";
    await handleWriteNote(vault, vaultPath, {
      path: "crud-test/append-test.md",
      content: original,
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    await handleAppendNote(vault, vaultPath, {
      path: "crud-test/append-test.md",
      content: "Appended line.",
      separator: "\n\n",
      create_if_missing: false,
      add_timestamp: false,
    });

    const result = await handleReadNote(vault, vaultPath, { path: "crud-test/append-test.md" });
    const data = parseResult(result);
    expect(data.content).toContain("Base content.");
    expect(data.content).toContain("Appended line.");
  });

  it("write → frontmatter set → read frontmatter → verify", async () => {
    const body = "# FM Test\n\nBody content.\n";
    await handleWriteNote(vault, vaultPath, {
      path: "crud-test/fm-test.md",
      content: body,
      overwrite: false,
    });

    // Set frontmatter by writing directly
    const fm = { title: "FM Test", tags: ["alpha", "beta"], status: "published" };
    const newContent = serializeFrontmatter(fm) + "\n" + body;
    await writeVaultFile(vaultPath, "crud-test/fm-test.md", newContent);

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const raw = await readVaultFile(vaultPath, "crud-test/fm-test.md");
    const parsed = parseFrontmatter(raw);

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter.title).toBe("FM Test");
    expect(parsed.frontmatter.tags).toEqual(["alpha", "beta"]);
    expect(parsed.frontmatter.status).toBe("published");
    expect(parsed.body).toContain("# FM Test");
  });

  it("write → delete → read returns error", async () => {
    await handleWriteNote(vault, vaultPath, {
      path: "crud-test/delete-test.md",
      content: "# To Delete\n",
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Verify it exists first
    const beforeResult = await handleReadNote(vault, vaultPath, { path: "crud-test/delete-test.md" });
    expect(beforeResult.isError).toBeUndefined();

    await handleDeleteNote(vault, vaultPath, {
      path: "crud-test/delete-test.md",
      permanent: true,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const afterResult = await handleReadNote(vault, vaultPath, { path: "crud-test/delete-test.md" });
    expect(afterResult.isError).toBe(true);
    expect(afterResult.content[0].text).toContain("ERROR");
  });

  it("write with overwrite protection → overwrite with flag", async () => {
    await handleWriteNote(vault, vaultPath, {
      path: "crud-test/overwrite-test.md",
      content: "# Version 1\n",
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Attempt without overwrite flag should fail
    const failResult = await handleWriteNote(vault, vaultPath, {
      path: "crud-test/overwrite-test.md",
      content: "# Version 2\n",
      overwrite: false,
    });
    expect(failResult.isError).toBe(true);
    expect(failResult.content[0].text).toContain("already exists");

    // With overwrite flag should succeed
    const successResult = await handleWriteNote(vault, vaultPath, {
      path: "crud-test/overwrite-test.md",
      content: "# Version 2\n",
      overwrite: true,
    });
    expect(successResult.isError).toBeUndefined();

    const result = await handleReadNote(vault, vaultPath, { path: "crud-test/overwrite-test.md" });
    const data = parseResult(result);
    expect(data.content).toBe("# Version 2\n");
  });
});
