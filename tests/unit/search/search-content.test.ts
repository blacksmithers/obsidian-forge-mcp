import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleSearchContent } from "../../../src/tool-handlers.js";

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

describe("handleSearchContent", () => {
  it("finds content in files", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);
    expect(data.count).toBeGreaterThanOrEqual(3);
    const paths = data.results.map((r: any) => r.path);
    expect(paths).toContain("00-Inbox/sample-note.md");
    expect(paths).toContain("notes/note-with-frontmatter.md");
    expect(paths).toContain("notes/target-note.md");
  });

  it("match_count reflects total occurrences", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);
    for (const r of data.results) {
      expect(r.match_count).toBeGreaterThanOrEqual(1);
    }
  });

  it("results sorted by match_count descending", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);
    const counts = data.results.map((r: any) => r.match_count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });

  it("respects limit", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 1,
      context_lines: 0,
    });
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.results.length).toBe(1);
  });

  it("context_lines provides surrounding context", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "obsidian",
      extensions: [".md"],
      limit: 20,
      context_lines: 2,
    });
    const data = parseResult(result);
    // With context_lines > 0, matches should have multi-line snippets
    const sampleResult = data.results.find((r: any) => r.path === "00-Inbox/sample-note.md");
    expect(sampleResult).toBeDefined();
    expect(sampleResult.matches.length).toBeGreaterThanOrEqual(1);
    // Context lines produce line-numbered output spanning multiple lines
    const snippet = sampleResult.matches[0];
    expect(snippet).toContain("obsidian");
    // With 2 context lines, the snippet should span more than 1 line
    const lineCount = snippet.split("\n").length;
    expect(lineCount).toBeGreaterThan(1);
  });

  it("case-insensitive matching", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "OBSIDIAN",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);
    expect(data.count).toBeGreaterThanOrEqual(3);
  });

  it("filters by extension", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "Node",
      extensions: [".canvas"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);
    // Only .canvas files should be searched
    for (const r of data.results) {
      expect(r.path).toMatch(/\.canvas$/);
    }
  });

  it("returns empty for no match", async () => {
    const result = await handleSearchContent(vault, vaultPath, {
      query: "zzz-nonexistent-term-zzz",
      extensions: [".md"],
      limit: 20,
      context_lines: 0,
    });
    const data = parseResult(result);
    expect(data.count).toBe(0);
    expect(data.results).toEqual([]);
  });
});
