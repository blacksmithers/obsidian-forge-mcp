/**
 * Extracted tool handler logic for testability.
 * Each function implements the core logic of an inline tool from index.ts.
 */

import { readFile, writeFile, mkdir, unlink, appendFile } from "node:fs/promises";
import path from "node:path";
import type { VaultIndex, FileEntry } from "./vault-index.js";

// ── Helpers ─────────────────────────────────────────────────────────

export function abs(vaultPath: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return path.join(vaultPath, normalized);
}

export function ensureMd(relPath: string): string {
  if (!path.extname(relPath)) return relPath + ".md";
  return relPath;
}

export async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
}

export function resolveOrFail(vault: VaultIndex, vaultPath: string, input: string): { abs: string; rel: string } {
  const entry = vault.resolve(input);
  if (entry) return { abs: entry.abs, rel: entry.rel };
  const rel = ensureMd(input.replace(/\\/g, "/").replace(/^\/+/, ""));
  return { abs: abs(vaultPath, rel), rel };
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// ── Tool result types ───────────────────────────────────────────────

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function jsonOk(data: unknown): ToolResult {
  return ok(JSON.stringify(data, null, 2));
}

// ── Tool Handlers ───────────────────────────────────────────────────

export async function handleVaultStatus(vault: VaultIndex, vaultPath: string): Promise<ToolResult> {
  const stats = vault.stats();
  return jsonOk({
    vaultPath,
    ...stats,
    topExtensions: Object.entries(stats.extensions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  });
}

export async function handleReadNote(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string },
): Promise<ToolResult> {
  const resolved = resolveOrFail(vault, vaultPath, args.path);
  try {
    const content = await readFile(resolved.abs, "utf-8");
    const entry = vault.get(resolved.rel);
    return ok(JSON.stringify({
      path: resolved.rel,
      size: entry?.size ?? content.length,
      mtime: entry?.mtime ? new Date(entry.mtime).toISOString() : null,
      content,
    }));
  } catch {
    return err(`ERROR: File not found: ${args.path} (resolved to: ${resolved.rel})`);
  }
}

export async function handleWriteNote(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string; content: string; overwrite: boolean },
): Promise<ToolResult> {
  const rel = ensureMd(args.path.replace(/\\/g, "/").replace(/^\/+/, ""));
  const absPath = abs(vaultPath, rel);

  if (!args.overwrite && vault.has(rel)) {
    return err(`ERROR: File already exists: ${rel}. Set overwrite=true to replace.`);
  }

  await ensureDir(absPath);
  await writeFile(absPath, args.content, "utf-8");
  return ok(`OK: Written ${rel} (${args.content.length} bytes)`);
}

export async function handleAppendNote(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string; content: string; separator: string; create_if_missing: boolean; add_timestamp: boolean },
): Promise<ToolResult> {
  const resolved = resolveOrFail(vault, vaultPath, args.path);
  const prefix = args.add_timestamp ? `\n<!-- ${timestamp()} -->\n` : "";
  const payload = args.separator + prefix + args.content;

  try {
    await appendFile(resolved.abs, payload, "utf-8");
    return ok(`OK: Appended ${payload.length} bytes to ${resolved.rel}`);
  } catch {
    if (args.create_if_missing) {
      await ensureDir(resolved.abs);
      await writeFile(resolved.abs, prefix + args.content, "utf-8");
      return ok(`OK: Created ${resolved.rel} with ${args.content.length} bytes`);
    }
    return err(`ERROR: File not found: ${resolved.rel}`);
  }
}

export async function handleEditNote(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string; old_str: string; new_str: string },
): Promise<ToolResult> {
  const resolved = resolveOrFail(vault, vaultPath, args.path);

  let content: string;
  try {
    content = await readFile(resolved.abs, "utf-8");
  } catch {
    return err(`ERROR: File not found: ${resolved.rel}`);
  }

  const occurrences = content.split(args.old_str).length - 1;
  if (occurrences === 0) {
    return err(`ERROR: String not found in ${resolved.rel}. Check exact spacing/newlines.`);
  }
  if (occurrences > 1) {
    return err(`ERROR: String found ${occurrences} times in ${resolved.rel}. Must be unique. Add surrounding context to disambiguate.`);
  }

  const updated = content.replace(args.old_str, args.new_str);
  await writeFile(resolved.abs, updated, "utf-8");
  return ok(`OK: Edited ${resolved.rel} (replaced ${args.old_str.length} → ${args.new_str.length} chars)`);
}

export async function handleDeleteNote(
  vault: VaultIndex,
  vaultPath: string,
  args: { path: string; permanent: boolean },
): Promise<ToolResult> {
  const resolved = resolveOrFail(vault, vaultPath, args.path);

  try {
    if (args.permanent) {
      await unlink(resolved.abs);
    } else {
      const trashDir = path.join(vaultPath, ".trash");
      await mkdir(trashDir, { recursive: true });
      const trashPath = path.join(trashDir, path.basename(resolved.abs));
      const content = await readFile(resolved.abs, "utf-8");
      await writeFile(trashPath, content, "utf-8");
      await unlink(resolved.abs);
    }
    return ok(`OK: Deleted ${resolved.rel}${args.permanent ? " (permanent)" : " (moved to .trash)"}`);
  } catch {
    return err(`ERROR: Could not delete: ${resolved.rel}`);
  }
}

export async function handleListDir(
  vault: VaultIndex,
  _vaultPath: string,
  args: {
    path: string;
    recursive: boolean;
    pattern?: string;
    sort_by: "name" | "created" | "modified" | "size";
    sort_order: "asc" | "desc";
    include_dirs: boolean;
  },
): Promise<ToolResult> {
  const { path: dirPath, recursive, pattern, sort_by, sort_order, include_dirs } = args;

  let files;
  if (recursive && pattern) {
    const fullPattern = dirPath === "." ? pattern : `${dirPath}/${pattern}`;
    files = vault.glob(fullPattern);
  } else if (recursive) {
    files = vault.searchPaths(dirPath === "." ? "" : dirPath);
  } else {
    files = vault.listDir(dirPath);
  }

  let fileListing = files.map((f) => ({
    path: f.rel,
    ext: f.ext,
    size: f.size,
    created: new Date(f.ctime).toISOString(),
    modified: new Date(f.mtime).toISOString(),
  }));

  fileListing.sort((a, b) => {
    switch (sort_by) {
      case "name":     return a.path.localeCompare(b.path);
      case "created":  return new Date(a.created).getTime() - new Date(b.created).getTime();
      case "modified": return new Date(a.modified).getTime() - new Date(b.modified).getTime();
      case "size":     return a.size - b.size;
      default:         return 0;
    }
  });
  if (sort_order === "desc") fileListing.reverse();

  let dirListing: Array<{ path: string; children_count: number; created: string; modified: string }> = [];
  if (include_dirs && !recursive) {
    const dirs = vault.listDirEntries(dirPath);
    dirListing = dirs.map((d) => ({
      path: d.rel,
      children_count: d.children_count,
      created: d.ctime ? new Date(d.ctime).toISOString() : "",
      modified: d.mtime ? new Date(d.mtime).toISOString() : "",
    }));

    dirListing.sort((a, b) => {
      switch (sort_by) {
        case "name":     return a.path.localeCompare(b.path);
        case "created":  return new Date(a.created || 0).getTime() - new Date(b.created || 0).getTime();
        case "modified": return new Date(a.modified || 0).getTime() - new Date(b.modified || 0).getTime();
        default:         return 0;
      }
    });
    if (sort_order === "desc") dirListing.reverse();
  }

  return jsonOk({
    directory: dirPath,
    count: fileListing.length + dirListing.length,
    directories: dirListing,
    files: fileListing,
  });
}

export async function handleSearchVault(
  vault: VaultIndex,
  _vaultPath: string,
  args: { query: string; limit: number },
): Promise<ToolResult> {
  const results = vault.searchPaths(args.query).slice(0, args.limit);
  return jsonOk({
    query: args.query,
    count: results.length,
    results: results.map((f) => ({
      path: f.rel,
      size: f.size,
      modified: new Date(f.mtime).toISOString(),
    })),
  });
}

export async function handleSearchContent(
  vault: VaultIndex,
  _vaultPath: string,
  args: { query: string; extensions: string[]; limit: number; context_lines: number },
): Promise<ToolResult> {
  const lower = args.query.toLowerCase();
  const candidates = vault.allFiles().filter((f) => args.extensions.includes(f.ext));
  const allResults: Array<{ path: string; match_count: number; matches: string[] }> = [];

  for (const file of candidates) {
    try {
      const content = await readFile(file.abs, "utf-8");
      if (!content.toLowerCase().includes(lower)) continue;

      let matchCount = 0;
      let searchPos = 0;
      const contentLower = content.toLowerCase();
      while (true) {
        const idx = contentLower.indexOf(lower, searchPos);
        if (idx === -1) break;
        matchCount++;
        searchPos = idx + 1;
      }

      const lines = content.split("\n");
      const matchLines: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lower)) {
          const start = Math.max(0, i - args.context_lines);
          const end = Math.min(lines.length - 1, i + args.context_lines);
          const snippet = lines
            .slice(start, end + 1)
            .map((l, idx) => `${start + idx + 1}: ${l}`)
            .join("\n");
          matchLines.push(snippet);
        }
      }
      allResults.push({ path: file.rel, match_count: matchCount, matches: matchLines });
    } catch {
      // Skip unreadable files
    }
  }

  allResults.sort((a, b) => b.match_count - a.match_count);
  const results = allResults.slice(0, args.limit);

  return jsonOk({ query: args.query, count: results.length, results });
}

export async function handleRecentNotes(
  vault: VaultIndex,
  _vaultPath: string,
  args: { limit: number; extension?: string },
): Promise<ToolResult> {
  let files = vault.recentFiles(args.limit * 2);
  if (args.extension) files = files.filter((f) => f.ext === args.extension);
  files = files.slice(0, args.limit);
  return jsonOk({
    count: files.length,
    files: files.map((f) => ({
      path: f.rel,
      modified: new Date(f.mtime).toISOString(),
      size: f.size,
    })),
  });
}

export async function handleDailyNote(
  vault: VaultIndex,
  vaultPath: string,
  args: { date?: string; folder: string; content_to_append?: string; template?: string },
): Promise<ToolResult> {
  const targetDate = args.date ?? new Date().toISOString().slice(0, 10);
  const relPath = `${args.folder}/${targetDate}.md`;
  const absPath = abs(vaultPath, relPath);

  let existed = vault.has(relPath);
  let content: string;

  if (!existed) {
    await ensureDir(absPath);
    const initial = args.template ?? `# ${targetDate}\n\n`;
    await writeFile(absPath, initial, "utf-8");
    content = initial;
  } else {
    content = await readFile(absPath, "utf-8");
  }

  if (args.content_to_append) {
    const payload = `\n${args.content_to_append}`;
    await appendFile(absPath, payload, "utf-8");
    content += payload;
  }

  return ok(JSON.stringify({
    path: relPath,
    created: !existed,
    appended: !!args.content_to_append,
    content,
  }));
}
