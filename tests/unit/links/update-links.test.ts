import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile, writeVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { updateWikilinks } from "../../../src/tools/links/update-links.js";

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

describe("update-links", () => {
  it("dry run counts links without modifying files", async () => {
    const contentBefore = await readVaultFile(vaultPath, "notes/note-with-links.md");
    const result = await updateWikilinks(vaultPath, vault, "notes/target-note.md", "notes/renamed-target.md", true);

    expect(result.totalLinks).toBeGreaterThan(0);
    expect(result.filesUpdated).toBeGreaterThan(0);

    // File should not be modified in dry run
    const contentAfter = await readVaultFile(vaultPath, "notes/note-with-links.md");
    expect(contentAfter).toBe(contentBefore);
  });

  it("actual update modifies file content", async () => {
    const result = await updateWikilinks(vaultPath, vault, "notes/target-note.md", "notes/renamed-target.md", false);
    expect(result.totalLinks).toBeGreaterThan(0);

    const content = await readVaultFile(vaultPath, "notes/note-with-links.md");
    expect(content).toContain("renamed-target");
  });

  it("updates both stem and path references", async () => {
    // Reset file for this test
    await writeVaultFile(
      vaultPath,
      "notes/test-update-refs.md",
      "Link by stem: [[renamed-target]]\nLink by path: [[notes/renamed-target]]\n",
    );
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await updateWikilinks(vaultPath, vault, "notes/renamed-target.md", "notes/final-target.md", false);
    const content = await readVaultFile(vaultPath, "notes/test-update-refs.md");
    expect(content).toContain("final-target");
    expect(result.totalLinks).toBeGreaterThanOrEqual(1);
  });

  it("handles alias and heading links", async () => {
    await writeVaultFile(
      vaultPath,
      "notes/test-alias-heading.md",
      "Alias: [[final-target|my alias]]\nHeading: [[final-target#section-one]]\n",
    );
    vault.destroy();
    vault = await createVaultIndex(vaultPath);

    const result = await updateWikilinks(vaultPath, vault, "notes/final-target.md", "notes/new-target.md", false);
    const content = await readVaultFile(vaultPath, "notes/test-alias-heading.md");
    expect(content).toContain("[[new-target|my alias]]");
    expect(content).toContain("[[new-target#section-one]]");
    expect(result.totalLinks).toBeGreaterThanOrEqual(2);
  });

  it("returns correct filesScanned count", async () => {
    const result = await updateWikilinks(vaultPath, vault, "notes/nonexistent-old.md", "notes/nonexistent-new.md", true);
    // filesScanned should include all md files in the vault
    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.totalLinks).toBe(0);
  });
});
