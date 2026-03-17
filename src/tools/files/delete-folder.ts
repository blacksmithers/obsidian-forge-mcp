import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdir, readdir, rm, rename as fsRename, stat } from "node:fs/promises";
import path from "node:path";
import type { VaultIndex } from "../../vault-index.js";
interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const PROTECTED_DIRS = [".obsidian", ".vaultforge", ".trash", ".git"];

function isProtected(relPath: string): boolean {
  const first = relPath.split("/")[0];
  return PROTECTED_DIRS.includes(first);
}

function isVaultRoot(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return norm === "" || norm === ".";
}

export async function handleDeleteFolder(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string; recursive: boolean; permanent: boolean },
): Promise<ToolResult> {
  const relPath = args.path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");

  if (isVaultRoot(relPath)) {
    return { content: [{ type: "text", text: "ERROR: Refusing to delete vault root." }], isError: true };
  }

  if (isProtected(relPath)) {
    return { content: [{ type: "text", text: `ERROR: Refusing to delete protected directory: ${relPath}` }], isError: true };
  }

  const absPath = path.join(vaultPath, relPath);

  // Verify it exists and is a directory
  try {
    const st = await stat(absPath);
    if (!st.isDirectory()) {
      return { content: [{ type: "text", text: `ERROR: Not a directory: ${relPath}` }], isError: true };
    }
  } catch {
    return { content: [{ type: "text", text: `ERROR: Directory not found: ${relPath}` }], isError: true };
  }

  // Count children on disk
  const childCount = await countDiskChildren(absPath);

  if (!args.recursive && childCount > 0) {
    return {
      content: [{
        type: "text",
        text: `ERROR: Directory '${relPath}' is not empty (${childCount} children). Use recursive: true to delete with contents, or delete contents first.`,
      }],
      isError: true,
    };
  }

  // Count index entries BEFORE deletion (fs.watch may clean up after rm)
  const preRemoved = vault.removeDir(relPath);
  let filesRemoved = preRemoved.filesRemoved;
  let dirsRemoved = preRemoved.dirsRemoved;
  if (dirsRemoved === 0) dirsRemoved = 1; // at least the dir itself

  if (!args.permanent) {
    // Move to .trash preserving relative path
    const trashDir = path.join(vaultPath, ".trash");
    const trashDest = path.join(trashDir, relPath);
    await mkdir(path.dirname(trashDest), { recursive: true });
    try {
      await fsRename(absPath, trashDest);
    } catch {
      // Cross-device or other issue — copy then delete
      const { cpSync } = await import("node:fs");
      cpSync(absPath, trashDest, { recursive: true });
      await rm(absPath, { recursive: true, force: true });
    }
  } else {
    await rm(absPath, { recursive: true, force: true });
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        path: relPath,
        deleted: true,
        files_removed: filesRemoved,
        dirs_removed: dirsRemoved,
        permanent: args.permanent,
      }, null, 2),
    }],
  };
}

async function countDiskChildren(absDir: string): Promise<number> {
  try {
    const entries = await readdir(absDir);
    return entries.length;
  } catch {
    return 0;
  }
}

export function registerDeleteFolder(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    "delete_folder",
    "Delete a directory from the vault. Refuses non-empty dirs by default — use recursive: true for non-empty. Moves to .trash by default for safety.",
    {
      path: z.string().describe("Relative path to the directory"),
      recursive: z.boolean().default(false).describe("If true, delete the folder AND all contents. If false (default), refuse non-empty directories."),
      permanent: z.boolean().default(false).describe("If true, skip .trash and delete permanently. If false (default), move to .trash."),
    },
    async ({ path: dirPath, recursive, permanent }) => {
      await vault.waitReady();
      const result = await handleDeleteFolder(vault, vaultPath, { path: dirPath, recursive, permanent });
      return { ...result };
    },
  );
}
