import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, writeVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";
import {
  handleSearchContent,
  handleVaultStatus,
  handleListDir,
  handleWriteNote,
} from "../../src/tool-handlers.js";

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

let vaultPath: string;
let vault: VaultIndex;

beforeAll(async () => {
  vaultPath = await createTempVault();

  // Write search test files before building the index
  await writeVaultFile(
    vaultPath,
    "search-test/alpha.md",
    "# Alpha\n\nThis document mentions obsidian obsidian obsidian three times.",
  );
  await writeVaultFile(
    vaultPath,
    "search-test/beta.md",
    "# Beta\n\nobsidian once.",
  );
  await writeVaultFile(
    vaultPath,
    "search-test/gamma.md",
    "# Gamma\n\nobsidian obsidian twice here.",
  );
  await writeVaultFile(
    vaultPath,
    "search-test/no-match.md",
    "# No Match\n\nThis document has no relevant keyword.",
  );

  vault = await createVaultIndex(vaultPath);
});

afterAll(async () => {
  vault.destroy();
  await cleanupTempVault(vaultPath);
});

describe("Search pipeline", () => {
  it("write multiple notes → searchContent finds them", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);

    // Should find alpha, beta, gamma (and possibly fixture files that mention "obsidian")
    const searchTestPaths = data.results
      .map((r: any) => r.path)
      .filter((p: string) => p.startsWith("search-test/"));
    expect(searchTestPaths).toContain("search-test/alpha.md");
    expect(searchTestPaths).toContain("search-test/beta.md");
    expect(searchTestPaths).toContain("search-test/gamma.md");
    expect(searchTestPaths).not.toContain("search-test/no-match.md");
  });

  it("search_content returns match_count for notes with multiple occurrences", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);

    const alpha = data.results.find((r: any) => r.path === "search-test/alpha.md");
    const beta = data.results.find((r: any) => r.path === "search-test/beta.md");
    const gamma = data.results.find((r: any) => r.path === "search-test/gamma.md");

    expect(alpha).toBeDefined();
    expect(alpha.match_count).toBe(3);
    expect(beta).toBeDefined();
    expect(beta.match_count).toBe(1);
    expect(gamma).toBeDefined();
    expect(gamma.match_count).toBe(2);
  });

  it("search_content results sorted by match_count descending", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);

    // Results should be sorted by match_count descending
    for (let i = 1; i < data.results.length; i++) {
      expect(data.results[i - 1].match_count).toBeGreaterThanOrEqual(data.results[i].match_count);
    }
  });

  it("vault_status reflects file counts", async () => {
    const result = await handleVaultStatus(vault, vaultPath);
    const data = parseResult(result);

    expect(data.vaultPath).toBe(vaultPath);
    // Should have at least the fixture files + search-test files
    expect(data.totalFiles).toBeGreaterThanOrEqual(4);
    expect(data.topExtensions).toBeDefined();
    expect(Array.isArray(data.topExtensions)).toBe(true);

    // .md should be the most common extension
    const mdEntry = data.topExtensions.find((e: any) => e[0] === ".md");
    expect(mdEntry).toBeDefined();
    expect(mdEntry[1]).toBeGreaterThanOrEqual(4);
  });

  it("list_dir shows new files and directories", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: "search-test",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: false,
    });
    const data = parseResult(result);

    expect(data.directory).toBe("search-test");
    expect(data.count).toBe(4);
    const filePaths = data.files.map((f: any) => f.path);
    expect(filePaths).toContain("search-test/alpha.md");
    expect(filePaths).toContain("search-test/beta.md");
    expect(filePaths).toContain("search-test/gamma.md");
    expect(filePaths).toContain("search-test/no-match.md");
  });

  it("list_dir with include_dirs shows parent directories", async () => {
    const result = await handleListDir(vault, vaultPath, {
      path: ".",
      recursive: false,
      sort_by: "name",
      sort_order: "asc",
      include_dirs: true,
    });
    const data = parseResult(result);

    expect(data.directories).toBeDefined();
    expect(Array.isArray(data.directories)).toBe(true);
    const dirPaths = data.directories.map((d: any) => d.path);
    expect(dirPaths).toContain("search-test");
  });
});
