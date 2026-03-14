/**
 * vault_suggest — Generate vault reorganization suggestions based on theme analysis.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VaultIndex } from "../../vault-index.js";
import { computeThemeMap, type ThemeMap } from "./vault-themes.js";
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";

type Strategy = "consolidate" | "create_mocs" | "archive_stale" | "triage_orphans";

interface Suggestion {
  type: Strategy;
  action: string;
  reason?: string;
  theme_id?: string;
  files?: Array<{ path: string; last_modified?: string; incoming_links?: number }>;
  file?: string;
  suggestion?: string;
  closest_theme?: string | null;
  content_preview?: string;
}

function findPrimaryFolder(files: string[], folders: string[]): string {
  // The folder with most files is the primary
  const counts = new Map<string, number>();
  for (const f of files) {
    const folder = f.split("/").slice(0, -1).join("/");
    counts.set(folder, (counts.get(folder) || 0) + 1);
  }

  let best = folders[0] || "";
  let bestCount = 0;
  for (const [folder, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = folder;
    }
  }
  return best;
}

async function scanWikilinks(
  vaultPath: string,
  vault: VaultIndex,
): Promise<Map<string, number>> {
  // Count incoming [[wikilinks]] for each file
  const incomingLinks = new Map<string, number>();
  const allFiles = vault.allFiles().filter((f) => f.ext === ".md");

  for (const file of allFiles) {
    try {
      const content = await readFile(file.abs, "utf-8");
      const links = content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
      if (!links) continue;

      for (const link of links) {
        const target = link.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/, "$1");
        // Resolve target to a path
        const entry = vault.resolve(target);
        if (entry) {
          incomingLinks.set(entry.rel, (incomingLinks.get(entry.rel) || 0) + 1);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return incomingLinks;
}

export function registerVaultSuggest(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    "vault_suggest",
    "Generate vault reorganization suggestions based on theme analysis. " +
      "Strategies: consolidate scattered themes, create MOCs, archive stale files, " +
      "triage orphans. Use mode='suggest' to preview, mode='execute' to apply.",
    {
      theme_map: z
        .any()
        .optional()
        .describe("Output from vault_themes (or runs vault_themes internally if omitted)"),
      mode: z
        .enum(["suggest", "execute"])
        .describe("suggest = dry run, execute = apply changes"),
      strategies: z
        .array(z.enum(["consolidate", "create_mocs", "archive_stale", "triage_orphans"]))
        .default(["consolidate", "create_mocs", "archive_stale", "triage_orphans"])
        .describe("Which strategies to apply"),
      archive_folder: z.string().default("90-Archive").describe("Archive folder path"),
      moc_folder: z.string().default("60-MOCs").describe("MOC folder path"),
      stale_days: z.number().default(90).describe("Days without modification to consider stale"),
    },
    async ({ theme_map, mode, strategies, archive_folder, moc_folder, stale_days }) => {
      await vault.waitReady();

      // Get or compute theme map
      let themes: ThemeMap;
      if (theme_map && typeof theme_map === "object" && "themes" in theme_map) {
        themes = theme_map as ThemeMap;
      } else {
        themes = await computeThemeMap(vaultPath, vault, {
          minClusterSize: 3,
          maxThemes: 15,
          excludeFolders: [],
          depth: "deep",
        });
      }

      const suggestions: Suggestion[] = [];

      // --- CONSOLIDATE ---
      if (strategies.includes("consolidate")) {
        for (const theme of themes.themes) {
          if (!theme.crossFolder) continue;
          const primary = findPrimaryFolder(theme.files, theme.folders);
          const primaryCount = theme.files.filter(
            (f) => f.split("/").slice(0, -1).join("/") === primary,
          ).length;

          for (const filePath of theme.files) {
            const fileFolder = filePath.split("/").slice(0, -1).join("/");
            if (fileFolder !== primary) {
              const fileName = basename(filePath);
              suggestions.push({
                type: "consolidate",
                theme_id: theme.id,
                action: `Move ${filePath} → ${primary}/${fileName}`,
                reason: `File's dominant theme is ${theme.label}. ${primaryCount} of ${theme.files.length} theme files are already in ${primary}/.`,
              });
            }
          }
        }
      }

      // --- CREATE MOCs ---
      if (strategies.includes("create_mocs")) {
        for (const theme of themes.themes) {
          if (theme.files.length < 3) continue;

          const mocFileName = `MOC-${theme.id.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("-")}.md`;
          const mocPath = `${moc_folder}/${mocFileName}`;
          const today = new Date().toISOString().slice(0, 10);

          const mocContent = [
            `# MOC: ${theme.label}`,
            "",
            `Key terms: ${theme.keyTerms.join(", ")}`,
            "",
            "## Files",
            "",
            ...theme.files.map((f) => `- [[${f.replace(/\.md$/, "")}]]`),
            "",
            "---",
            `*Auto-generated by obsidian-forge vault_suggest on ${today}*`,
          ].join("\n");

          suggestions.push({
            type: "create_mocs",
            theme_id: theme.id,
            action: `Create ${mocPath} with ${theme.files.length} links`,
            content_preview: mocContent.slice(0, 200) + (mocContent.length > 200 ? "..." : ""),
          });
        }
      }

      // --- ARCHIVE STALE ---
      if (strategies.includes("archive_stale")) {
        const staleCutoff = Date.now() - stale_days * 24 * 60 * 60 * 1000;
        const incomingLinks = await scanWikilinks(vaultPath, vault);

        const staleFiles: Array<{ path: string; last_modified: string; incoming_links: number }> = [];
        for (const file of vault.allFiles()) {
          if (file.ext !== ".md") continue;
          if (file.rel.startsWith(archive_folder + "/")) continue;
          if (file.mtime > staleCutoff) continue;

          const links = incomingLinks.get(file.rel) || 0;
          if (links > 0) continue; // Still referenced — don't archive

          staleFiles.push({
            path: file.rel,
            last_modified: new Date(file.mtime).toISOString().slice(0, 10),
            incoming_links: links,
          });
        }

        if (staleFiles.length > 0) {
          suggestions.push({
            type: "archive_stale",
            action: `Archive ${staleFiles.length} stale files to ${archive_folder}/`,
            reason: `Files not modified in ${stale_days}+ days with no incoming wikilinks`,
            files: staleFiles,
          });
        }
      }

      // --- TRIAGE ORPHANS ---
      if (strategies.includes("triage_orphans")) {
        for (const orphan of themes.orphans) {
          // Find closest theme by checking if any theme has files in the same folder
          const orphanFolder = orphan.path.split("/").slice(0, -1).join("/");
          let closestTheme: string | null = null;

          for (const theme of themes.themes) {
            if (theme.folders.includes(orphanFolder)) {
              closestTheme = theme.id;
              break;
            }
          }

          if (closestTheme) {
            suggestions.push({
              type: "triage_orphans",
              file: orphan.path,
              suggestion: `Could be related to theme "${closestTheme}" — already in a theme folder`,
              closest_theme: closestTheme,
              action: `Review ${orphan.path} for theme affinity`,
            });
          } else {
            suggestions.push({
              type: "triage_orphans",
              file: orphan.path,
              suggestion: "No clear theme affinity — consider archiving or manual review",
              closest_theme: null,
              action: `Review ${orphan.path} — no theme match found`,
            });
          }
        }
      }

      // --- EXECUTE ---
      if (mode === "execute") {
        const executed: Array<{ action: string; from?: string; to?: string; path?: string }> = [];
        let errors = 0;
        let skipped = 0;

        for (const s of suggestions) {
          try {
            if (s.type === "consolidate") {
              const match = s.action.match(/^Move (.+) → (.+)$/);
              if (!match) { skipped++; continue; }
              const [, from, to] = match;
              const absFrom = join(vaultPath, from);
              const absTo = join(vaultPath, to);
              await mkdir(dirname(absTo), { recursive: true });
              const content = await readFile(absFrom, "utf-8");
              await writeFile(absTo, content, "utf-8");
              const { unlink } = await import("node:fs/promises");
              await unlink(absFrom);
              executed.push({ action: "moved", from, to });
            } else if (s.type === "create_mocs" && s.content_preview) {
              const match = s.action.match(/^Create (.+) with/);
              if (!match) { skipped++; continue; }
              const mocPath = match[1];
              // Reconstruct full MOC content
              const theme = themes.themes.find((t) => t.id === s.theme_id);
              if (!theme) { skipped++; continue; }

              const today = new Date().toISOString().slice(0, 10);
              const mocContent = [
                `# MOC: ${theme.label}`,
                "",
                `Key terms: ${theme.keyTerms.join(", ")}`,
                "",
                "## Files",
                "",
                ...theme.files.map((f) => `- [[${f.replace(/\.md$/, "")}]]`),
                "",
                "---",
                `*Auto-generated by obsidian-forge vault_suggest on ${today}*`,
              ].join("\n");

              const absPath = join(vaultPath, mocPath);
              await mkdir(dirname(absPath), { recursive: true });
              await writeFile(absPath, mocContent, "utf-8");
              executed.push({ action: "created", path: mocPath });
            } else if (s.type === "archive_stale" && s.files) {
              for (const file of s.files) {
                const from = file.path;
                const to = `${archive_folder}/${basename(from)}`;
                const absFrom = join(vaultPath, from);
                const absTo = join(vaultPath, to);
                await mkdir(dirname(absTo), { recursive: true });
                const content = await readFile(absFrom, "utf-8");
                await writeFile(absTo, content, "utf-8");
                const { unlink } = await import("node:fs/promises");
                await unlink(absFrom);
                executed.push({ action: "moved", from, to });
              }
            } else {
              skipped++;
            }
          } catch {
            errors++;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  executed: executed.length,
                  skipped,
                  errors,
                  details: executed,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // --- SUGGEST MODE ---
      const summary: Record<string, number> = {};
      for (const s of suggestions) {
        summary[s.type] = (summary[s.type] || 0) + 1;
      }
      const total = suggestions.length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                suggestions,
                summary: {
                  ...summary,
                  total_actions: total,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
