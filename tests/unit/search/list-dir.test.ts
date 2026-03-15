import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleListDir } from "../../../src/tool-handlers.js";

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

describe("handleListDir", () => {
  it("lists files in root directory", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);
    expect(data.directory).toBe(".");
    // Root has no direct files, only directories
    expect(data.files).toBeInstanceOf(Array);
  });

  it("includes directories when include_dirs=true (default)", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: true,
    });
    const data = parseResult(result);
    expect(data.directories.length).toBeGreaterThan(0);
    const dirPaths = data.directories.map((d: any) => d.path);
    expect(dirPaths).toContain("notes");
    expect(dirPaths).toContain("00-Inbox");
    expect(dirPaths).toContain("01-Daily");
    expect(dirPaths).toContain("canvas");
  });

  it("directories have children_count", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: true,
    });
    const data = parseResult(result);
    const notesDir = data.directories.find((d: any) => d.path === "notes");
    expect(notesDir).toBeDefined();
    expect(notesDir.children_count).toBeGreaterThanOrEqual(4);
  });

  it("excludes directories when include_dirs=false", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);
    expect(data.directories).toEqual([]);
  });

  it("lists subdirectory files", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: "notes",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);
    expect(data.files.length).toBe(4);
    const paths = data.files.map((f: any) => f.path);
    expect(paths).toContain("notes/linked-note.md");
    expect(paths).toContain("notes/note-with-frontmatter.md");
    expect(paths).toContain("notes/note-with-links.md");
    expect(paths).toContain("notes/target-note.md");
  });

  it("sorts by name ascending (default)", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: "notes",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);
    const paths = data.files.map((f: any) => f.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it("sorts by modified descending", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: "notes",
      recursive: false,
      sort_by: "modified",
      sort_order: "desc",
      include_dirs: false,
    });
    const data = parseResult(result);
    const times = data.files.map((f: any) => new Date(f.modified).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }
  });

  it("recursive listing includes all files", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: true,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);
    // Should include files from all subdirectories
    const paths = data.files.map((f: any) => f.path);
    expect(paths).toContain("00-Inbox/sample-note.md");
    expect(paths).toContain("01-Daily/2026-01-01.md");
    expect(paths).toContain("notes/target-note.md");
    expect(paths).toContain("canvas/test-canvas.canvas");
    expect(data.files.length).toBeGreaterThanOrEqual(7);
  });

  it("pattern filter works with recursive", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: true,
      pattern: "**/*.md",
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);
    // All returned files should be .md
    for (const f of data.files) {
      expect(f.path).toMatch(/\.md$/);
    }
    // The .canvas file should not be included
    const paths = data.files.map((f: any) => f.path);
    expect(paths).not.toContain("canvas/test-canvas.canvas");
  });

  it("directories are NOT filtered by pattern (they always show)", async () => {
    // When not recursive, directories always appear regardless of pattern
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: false,
      pattern: "*.md",
      sort_by: "name",
      sort_order: "asc",
      include_dirs: true,
    });
    const data = parseResult(result);
    // Directories should still be listed
    expect(data.directories.length).toBeGreaterThan(0);
  });

  it("empty directory returns empty result", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: "nonexistent-dir",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: true,
    });
    const data = parseResult(result);
    expect(data.files).toEqual([]);
    expect(data.directories).toEqual([]);
    expect(data.count).toBe(0);
  });
});
