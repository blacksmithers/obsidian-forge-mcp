import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";
import {
  handleReadNote,
  handleWriteNote,
  handleEditNote,
  handleAppendNote,
  handleDeleteNote,
  handleListDir,
  handleSearchContent,
  handleDailyNote,
} from "../../src/tool-handlers.js";

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

describe("Batch pipeline", () => {
  it("write 3 files → list_dir shows them → delete one → list_dir shows 2", async () => {
    await handleWriteNote(vault, vaultPath, {
      path: "batch-test/file-a.md",
      content: "# File A\n",
      overwrite: false,
    });
    await handleWriteNote(vault, vaultPath, {
      path: "batch-test/file-b.md",
      content: "# File B\n",
      overwrite: false,
    });
    await handleWriteNote(vault, vaultPath, {
      path: "batch-test/file-c.md",
      content: "# File C\n",
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // List should show 3 files
    const listResult1 = await handleListDir(vault, vaultPath, {
      path: "batch-test",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const listData1 = parseResult(listResult1);
    expect(listData1.count).toBe(3);

    // Delete one
    await handleDeleteNote(vault, vaultPath, {
      path: "batch-test/file-b.md",
      permanent: true,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // List should show 2 files
    const listResult2 = await handleListDir(vault, vaultPath, {
      path: "batch-test",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const listData2 = parseResult(listResult2);
    expect(listData2.count).toBe(2);
    const paths = listData2.files.map((f: any) => f.path);
    expect(paths).toContain("batch-test/file-a.md");
    expect(paths).toContain("batch-test/file-c.md");
    expect(paths).not.toContain("batch-test/file-b.md");
  });

  it("write → edit → append → read → verify full content", async () => {
    await handleWriteNote(vault, vaultPath, {
      path: "batch-test/multi-op.md",
      content: "# Multi Op\n\nOriginal line.\n",
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Edit
    await handleEditNote(vault, vaultPath, {
      path: "batch-test/multi-op.md",
      old_str: "Original line.",
      new_str: "Edited line.",
    });

    // Append
    await handleAppendNote(vault, vaultPath, {
      path: "batch-test/multi-op.md",
      content: "Appended section.",
      separator: "\n\n",
      create_if_missing: false,
      add_timestamp: false,
    });

    const result = await handleReadNote(vault, vaultPath, { path: "batch-test/multi-op.md" });
    const data = parseResult(result);
    expect(data.content).toContain("# Multi Op");
    expect(data.content).toContain("Edited line.");
    expect(data.content).not.toContain("Original line.");
    expect(data.content).toContain("Appended section.");
  });

  it("daily_note create → daily_note append → read shows both", async () => {
    const createResult = await handleDailyNote(vault, vaultPath, {
      date: "2026-03-15",
      folder: "01-Daily",
    });
    const createData = parseResult(createResult);
    expect(createData.created).toBe(true);
    expect(createData.path).toBe("01-Daily/2026-03-15.md");
    expect(createData.content).toContain("# 2026-03-15");

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Append to the same daily note
    const appendResult = await handleDailyNote(vault, vaultPath, {
      date: "2026-03-15",
      folder: "01-Daily",
      content_to_append: "- Meeting at 10am",
    });
    const appendData = parseResult(appendResult);
    expect(appendData.created).toBe(false);
    expect(appendData.appended).toBe(true);

    // Read and verify both initial content and appended content
    const readResult = await handleReadNote(vault, vaultPath, { path: "01-Daily/2026-03-15.md" });
    const readData = parseResult(readResult);
    expect(readData.content).toContain("# 2026-03-15");
    expect(readData.content).toContain("- Meeting at 10am");
  });

  it("write → search finds it → delete → search does not find it", async () => {
    await handleWriteNote(vault, vaultPath, {
      path: "batch-test/searchable.md",
      content: "# Searchable\n\nUnique phrase xylophone_marker here.\n",
      overwrite: false,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Search should find it
    const searchResult1 = await handleSearchContent(vault, vaultPath, {
      query: "xylophone_marker",
      extensions: [".md"],
      limit: 10,
      context_lines: 0,
    });
    const searchData1 = parseResult(searchResult1);
    expect(searchData1.count).toBeGreaterThanOrEqual(1);
    const foundPaths1 = searchData1.results.map((r: any) => r.path);
    expect(foundPaths1).toContain("batch-test/searchable.md");

    // Delete the file
    await handleDeleteNote(vault, vaultPath, {
      path: "batch-test/searchable.md",
      permanent: true,
    });

    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    // Search should no longer find it
    const searchResult2 = await handleSearchContent(vault, vaultPath, {
      query: "xylophone_marker",
      extensions: [".md"],
      limit: 10,
      context_lines: 0,
    });
    const searchData2 = parseResult(searchResult2);
    const foundPaths2 = searchData2.results.map((r: any) => r.path);
    expect(foundPaths2).not.toContain("batch-test/searchable.md");
  });
});
