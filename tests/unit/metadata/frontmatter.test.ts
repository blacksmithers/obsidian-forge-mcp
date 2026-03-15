import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { parseFrontmatter, serializeFrontmatter } from "../../../src/tools/metadata/frontmatter.js";

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

describe("frontmatter", () => {
  it("parseFrontmatter extracts YAML data", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-frontmatter.md");
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeDefined();
    expect(result.frontmatter.title).toBe("Frontmatter Test");
    expect(result.frontmatter.status).toBe("draft");
  });

  it("parseFrontmatter returns hasFrontmatter=true for files with frontmatter", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-frontmatter.md");
    const result = parseFrontmatter(content);
    expect(result.hasFrontmatter).toBe(true);
  });

  it("parseFrontmatter returns hasFrontmatter=false for plain files", async () => {
    const content = await readVaultFile(vaultPath, "notes/target-note.md");
    const result = parseFrontmatter(content);
    expect(result.hasFrontmatter).toBe(false);
  });

  it("parseFrontmatter handles arrays", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-frontmatter.md");
    const result = parseFrontmatter(content);
    expect(Array.isArray(result.frontmatter.tags)).toBe(true);
    expect(result.frontmatter.tags).toContain("test");
    expect(result.frontmatter.tags).toContain("metadata");
  });

  it("parseFrontmatter handles numbers", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-frontmatter.md");
    const result = parseFrontmatter(content);
    expect(result.frontmatter.priority).toBe(3);
    expect(typeof result.frontmatter.priority).toBe("number");
  });

  it("parseFrontmatter handles booleans", () => {
    const content = "---\npublished: true\ndraft: false\n---\n\nBody text";
    const result = parseFrontmatter(content);
    expect(result.frontmatter.published).toBe(true);
    expect(result.frontmatter.draft).toBe(false);
  });

  it("serializeFrontmatter creates valid YAML block", () => {
    const fm = { title: "Test", status: "published" };
    const result = serializeFrontmatter(fm);
    expect(result).toContain("---");
    expect(result).toContain("title: Test");
    expect(result).toContain("status: published");
    expect(result.startsWith("---\n")).toBe(true);
    expect(result.endsWith("\n---")).toBe(true);
  });

  it("serializeFrontmatter handles arrays", () => {
    const fm = { tags: ["alpha", "beta", "gamma"] };
    const result = serializeFrontmatter(fm);
    expect(result).toContain("tags: [alpha, beta, gamma]");
  });

  it("parseFrontmatter preserves body content", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-frontmatter.md");
    const result = parseFrontmatter(content);
    expect(result.body).toContain("# Frontmatter Test");
    expect(result.body).toContain("Section One");
  });
});
