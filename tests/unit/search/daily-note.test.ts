import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { handleDailyNote } from "../../../src/tool-handlers.js";

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

describe("handleDailyNote", () => {
  it("creates daily note if missing", async () => {
    const result = await handleDailyNote(vault, vaultPath, {
      date: "2026-03-15",
      folder: "01-Daily",
    });
    const data = parseResult(result);
    expect(data.path).toBe("01-Daily/2026-03-15.md");
    expect(data.created).toBe(true);
    expect(data.content).toContain("# 2026-03-15");

    // Verify file was actually written
    const fileContent = await readVaultFile(vaultPath, "01-Daily/2026-03-15.md");
    expect(fileContent).toContain("# 2026-03-15");
  });

  it("appends content to existing daily note", async () => {
    // First create the note
    await handleDailyNote(vault, vaultPath, {
      date: "2026-06-01",
      folder: "01-Daily",
    });

    // Wait for fs watcher to pick up the new file
    await new Promise((r) => setTimeout(r, 200));

    // Then append to it
    const result = await handleDailyNote(vault, vaultPath, {
      date: "2026-06-01",
      folder: "01-Daily",
      content_to_append: "- New task added",
    });
    const data = parseResult(result);
    expect(data.appended).toBe(true);
    expect(data.content).toContain("- New task added");
  });

  it("uses custom template", async () => {
    const template = "---\ndate: 2026-04-01\n---\n\n# Daily Log\n\n";
    const result = await handleDailyNote(vault, vaultPath, {
      date: "2026-04-01",
      folder: "01-Daily",
      template,
    });
    const data = parseResult(result);
    expect(data.created).toBe(true);
    expect(data.content).toContain("# Daily Log");
    expect(data.content).toContain("date: 2026-04-01");
  });

  it("uses custom folder", async () => {
    const result = await handleDailyNote(vault, vaultPath, {
      date: "2026-05-01",
      folder: "custom-daily",
    });
    const data = parseResult(result);
    expect(data.path).toBe("custom-daily/2026-05-01.md");
    expect(data.created).toBe(true);

    // Verify the file exists in the custom folder
    const fileContent = await readVaultFile(vaultPath, "custom-daily/2026-05-01.md");
    expect(fileContent).toContain("# 2026-05-01");
  });

  it("returns created=true for new note", async () => {
    const result = await handleDailyNote(vault, vaultPath, {
      date: "2026-07-07",
      folder: "01-Daily",
    });
    const data = parseResult(result);
    expect(data.created).toBe(true);
  });
});
