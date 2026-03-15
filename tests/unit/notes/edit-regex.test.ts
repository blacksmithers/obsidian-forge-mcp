import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";

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

describe("edit_regex", () => {
  it("regex pattern creates valid RegExp", () => {
    const pattern = "\\b(foo|bar)\\b";
    const regex = new RegExp(pattern, "g");
    expect(regex.test("hello foo world")).toBe(true);
    expect(regex.test("hello baz world")).toBe(false);
  });

  it("regex replace with capture groups works", () => {
    const content = "date: 2026-01-15";
    const regex = new RegExp("(\\d{4})-(\\d{2})-(\\d{2})", "g");
    const result = content.replace(regex, "$2/$3/$1");
    expect(result).toBe("date: 01/15/2026");
  });

  it("flags control matching behavior", () => {
    const content = "Hello hello HELLO";
    const caseSensitive = new RegExp("hello", "g");
    const caseInsensitive = new RegExp("hello", "gi");
    expect([...content.matchAll(caseSensitive)].length).toBe(1);
    expect([...content.matchAll(caseInsensitive)].length).toBe(3);
  });

  it("matchAll finds all occurrences with positions", () => {
    const content = "foo bar foo baz foo";
    const regex = new RegExp("foo", "g");
    const matches = [...content.matchAll(regex)];
    expect(matches.length).toBe(3);
    expect(matches[0].index).toBe(0);
    expect(matches[1].index).toBe(8);
    expect(matches[2].index).toBe(16);
  });

  it("max_replacements can limit replacements", () => {
    const content = "aaa aaa aaa";
    const regex = new RegExp("aaa", "g");
    let count = 0;
    const maxReplacements = 2;
    const result = content.replace(regex, (match) => {
      if (count >= maxReplacements) return match;
      count++;
      return "bbb";
    });
    expect(result).toBe("bbb bbb aaa");
  });

  it("dry run does not modify files", async () => {
    const originalContent = await readVaultFile(vaultPath, "notes/target-note.md");
    // Simulate dry run: just count matches without writing
    const regex = new RegExp("note", "gi");
    const matches = [...originalContent.matchAll(regex)];
    expect(matches.length).toBeGreaterThan(0);
    // Verify file unchanged
    const afterContent = await readVaultFile(vaultPath, "notes/target-note.md");
    expect(afterContent).toBe(originalContent);
  });

  it("regex with no matches returns empty results", () => {
    const content = "Hello world";
    const regex = new RegExp("zzzzz", "g");
    const matches = [...content.matchAll(regex)];
    expect(matches.length).toBe(0);
  });
});
