import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readdir, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import type { VaultIndex } from "../../vault-index.js";
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const DEFAULT_EXCLUDES = [".obsidian", ".obsidian-forge", ".trash", ".git", "Templates"];

export async function handlePruneEmptyDirs(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string; dry_run: boolean; exclude: string[] },
): Promise<ToolResult> {
  const relStart = args.path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "") || ".";
  const absStart = relStart === "." ? vaultPath : path.join(vaultPath, relStart);
  const excludeSet = new Set(args.exclude);

  const emptyDirs: Array<{ path: string; reason: string }> = [];
  let scanned = 0;

  // Post-order traversal: returns true if the directory is empty after pruning
  async function walk(absDir: string, relDir: string): Promise<boolean> {
    scanned++;

    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return false;
    }

    let hasFiles = false;
    let hasNonEmptySubdirs = false;

    for (const entry of entries) {
      if (entry.name.startsWith(".") && excludeSet.has(entry.name)) continue;

      const childRel = relDir === "." ? entry.name : `${relDir}/${entry.name}`;
      const childAbs = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (excludeSet.has(entry.name)) {
          hasNonEmptySubdirs = true;
          continue;
        }

        const childEmpty = await walk(childAbs, childRel);
        if (!childEmpty) {
          hasNonEmptySubdirs = true;
        }
      } else {
        hasFiles = true;
      }
    }

    if (!hasFiles && !hasNonEmptySubdirs && relDir !== ".") {
      const reason = entries.length === 0
        ? "No files or subdirectories"
        : "Only contained empty subdirectories (pruned)";
      emptyDirs.push({ path: relDir, reason });
      return true;
    }

    return false;
  }

  await walk(absStart, relStart);

  // Sort bottom-up (deepest paths first) for deletion order
  emptyDirs.sort((a, b) => b.path.split("/").length - a.path.split("/").length);

  let deleted = 0;
  if (!args.dry_run) {
    for (const dir of emptyDirs) {
      const absDir = path.join(vaultPath, dir.path);
      try {
        await rmdir(absDir);
        vault.removeDir(dir.path);
        deleted++;
      } catch {
        // Directory may have been already removed or not actually empty
      }
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        scanned,
        empty_found: emptyDirs.length,
        deleted: args.dry_run ? 0 : deleted,
        dry_run: args.dry_run,
        directories: emptyDirs,
      }, null, 2),
    }],
  };
}

export function registerPruneEmptyDirs(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    "prune_empty_dirs",
    "Find and remove empty directories in the vault. Dry run by default — preview before deleting. Bottom-up pruning handles cascading empty dirs.",
    {
      path: z.string().default(".").describe("Starting directory to scan (default: vault root)"),
      dry_run: z.boolean().default(true).describe("Preview without deleting (default: true). Set false to execute."),
      exclude: z.array(z.string()).default(DEFAULT_EXCLUDES).describe("Directories to skip (default: .obsidian, .obsidian-forge, .trash, .git, Templates)"),
    },
    async ({ path: dirPath, dry_run, exclude }) => {
      await vault.waitReady();
      const result = await handlePruneEmptyDirs(vault, vaultPath, { path: dirPath, dry_run, exclude });
      return { ...result };
    },
  );
}
