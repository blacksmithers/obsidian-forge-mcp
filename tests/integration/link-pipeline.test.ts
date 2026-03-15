import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";
import { findLinksInContent, extractStem } from "../../src/tools/links/link-utils.js";
import { updateWikilinks } from "../../src/tools/links/update-links.js";

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

describe("Link pipeline", () => {
  it("findLinksInContent detects all link types in note-with-links.md", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);

    // Should find: [[target-note]], ![[target-note]], [[target-note|my alias]], [[target-note#section-one]]
    expect(matches.length).toBe(4);

    const linkTexts = matches.map((m) => m.link);
    expect(linkTexts).toContain("[[target-note]]");
    expect(linkTexts).toContain("![[target-note]]");
    expect(linkTexts).toContain("[[target-note|my alias]]");
    expect(linkTexts).toContain("[[target-note#section-one]]");

    // Check embed detection
    const embeds = matches.filter((m) => m.is_embed);
    expect(embeds.length).toBe(1);
    expect(embeds[0].link).toBe("![[target-note]]");
  });

  it("backlinks: target-note.md is linked from note-with-links.md", async () => {
    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const matches = findLinksInContent(content, "notes/target-note", "target-note", true);

    // note-with-links.md should have links to target-note
    expect(matches.length).toBeGreaterThan(0);

    // The linked-note file also links back to note-with-links
    const linkedContent = await readVaultFile(vaultPath, "notes/linked-note.md");
    const backlinks = findLinksInContent(linkedContent, "notes/note-with-links", "note-with-links", false);
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].link).toBe("[[note-with-links]]");
  });

  it("updateWikilinks in dry_run mode reports affected files without modifying", async () => {
    const contentBefore = await readVaultFile(vaultPath, "notes/note-with-links.md");

    const result = await updateWikilinks(
      vaultPath,
      vault,
      "notes/target-note.md",
      "notes/renamed-target.md",
      true, // dry_run
    );

    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.filesUpdated).toBeGreaterThanOrEqual(1);
    expect(result.totalLinks).toBeGreaterThanOrEqual(1);

    // Check that note-with-links.md is among affected files
    const affected = result.results.map((r) => r.path);
    expect(affected).toContain("notes/note-with-links.md");

    // Content should NOT have changed (dry run)
    const contentAfter = await readVaultFile(vaultPath, "notes/note-with-links.md");
    expect(contentAfter).toBe(contentBefore);
  });

  it("updateWikilinks actually updates content when not dry_run", async () => {
    const result = await updateWikilinks(
      vaultPath,
      vault,
      "notes/target-note.md",
      "notes/renamed-target.md",
      false, // not dry_run
    );

    expect(result.filesUpdated).toBeGreaterThanOrEqual(1);
    expect(result.totalLinks).toBeGreaterThanOrEqual(1);

    // Verify the file was actually modified
    const updatedContent = await readVaultFile(vaultPath, "notes/note-with-links.md");
    expect(updatedContent).toContain("[[renamed-target]]");
    expect(updatedContent).not.toContain("[[target-note]]");
    expect(updatedContent).toContain("[[renamed-target|my alias]]");
    expect(updatedContent).toContain("[[renamed-target#section-one]]");
  });

  it("after rename, links are updated correctly (simulate with updateWikilinks)", async () => {
    // Now rename back: renamed-target → final-target
    const result = await updateWikilinks(
      vaultPath,
      vault,
      "notes/renamed-target.md",
      "notes/final-target.md",
      false,
    );

    expect(result.filesUpdated).toBeGreaterThanOrEqual(1);

    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    expect(content).toContain("[[final-target]]");
    expect(content).toContain("![[final-target]]");
    expect(content).toContain("[[final-target|my alias]]");
    expect(content).toContain("[[final-target#section-one]]");
    expect(content).not.toContain("renamed-target");
  });

  it("extractStem returns filename without extension", () => {
    expect(extractStem("notes/target-note.md")).toBe("target-note");
    expect(extractStem("folder/sub/my-file.txt")).toBe("my-file");
    expect(extractStem("simple.md")).toBe("simple");
    expect(extractStem("no-extension")).toBe("no-extension");
  });
});
