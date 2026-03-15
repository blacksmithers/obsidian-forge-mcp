import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { findLinksInContent, extractStem } from "../../../src/tools/links/link-utils.js";

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

describe("backlinks", () => {
  it("finds wikilinks to target file", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const links = matches.map((m) => m.link);
    expect(links.some((l) => l === "[[target-note]]")).toBe(true);
  });

  it("detects embed links (![[...]])", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);
    const embeds = matches.filter((m) => m.is_embed);
    expect(embeds.length).toBeGreaterThanOrEqual(1);
    expect(embeds[0].link).toBe("![[target-note]]");
  });

  it("includes line numbers", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);
    for (const match of matches) {
      expect(match.line).toBeGreaterThan(0);
      expect(typeof match.line).toBe("number");
    }
  });

  it("detects alias links ([[target|alias]])", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);
    const aliasLinks = matches.filter((m) => m.link.includes("|"));
    expect(aliasLinks.length).toBeGreaterThanOrEqual(1);
    expect(aliasLinks[0].link).toContain("my alias");
  });

  it("detects heading links ([[target#heading]])", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);
    const headingLinks = matches.filter((m) => m.link.includes("#"));
    expect(headingLinks.length).toBeGreaterThanOrEqual(1);
    expect(headingLinks[0].link).toContain("section-one");
  });

  it("returns empty for no backlinks", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/nonexistent-note", "nonexistent-note", true);
    expect(matches.length).toBe(0);
  });

  it("extractStem returns filename without extension", () => {
    expect(extractStem("notes/target-note.md")).toBe("target-note");
    expect(extractStem("folder/sub/file.txt")).toBe("file");
    expect(extractStem("simple.md")).toBe("simple");
  });
});
