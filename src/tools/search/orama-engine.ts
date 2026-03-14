/**
 * Orama search engine singleton.
 * Manages BM25 index lifecycle: create, persist, reload, search.
 */

import { create, insertMultiple, search as oramaSearch, save, load, remove, type Results } from "@orama/orama";

// Orama's search returns sync Results for sync DBs but types it as Results | Promise<Results>.
// We only use sync create(), so search is always sync. This wrapper narrows the type.
function search(db: any, params: any): Results<any> {
  return oramaSearch(db, params) as Results<any>;
}
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import type { VaultIndex } from "../../vault-index.js";
import { stripMarkdown, extractFrontmatter, extractHeadings } from "./markdown-parser.js";

const CACHE_DIR = ".obsidian-forge";
const CACHE_FILE = "search-index.json";
const MAX_CONTENT_SIZE = 50 * 1024; // 50KB — truncate for indexing

const SCHEMA = {
  path: "string" as const,
  title: "string" as const,
  content: "string" as const,
  tags: "string" as const,
  headings: "string" as const,
};

type OramaDB = ReturnType<typeof create<typeof SCHEMA>>;

let db: OramaDB | null = null;
let indexedCount = 0;

export function getIndexedCount(): number {
  return indexedCount;
}

export function getOrCreateIndex(vaultPath: string, vaultIndex: VaultIndex): OramaDB {
  if (db) return db;

  db = create({ schema: SCHEMA });

  const cachePath = join(vaultPath, CACHE_DIR, CACHE_FILE);

  // Try loading cache synchronously isn't possible — we'll do full index on first use
  // Cache loading happens via ensureIndex()
  return db;
}

export async function ensureIndex(vaultPath: string, vaultIndex: VaultIndex): Promise<OramaDB> {
  if (db && indexedCount > 0) return db;

  if (!db) {
    db = create({ schema: SCHEMA });
  }

  const cachePath = join(vaultPath, CACHE_DIR, CACHE_FILE);

  try {
    const cached = JSON.parse(await readFile(cachePath, "utf-8"));
    load(db, cached);
    // Count indexed docs from loaded cache
    const countResult = search(db, { term: "", limit: 0 });
    indexedCount = countResult.count;

    if (indexedCount > 0) {
      return db;
    }
  } catch {
    // No cache or corrupt — full re-index
  }

  await fullReindex(vaultPath, vaultIndex);
  return db;
}

export async function fullReindex(
  vaultPath: string,
  vaultIndex: VaultIndex,
): Promise<{ indexed: number; skipped: number; elapsed: string }> {
  const start = performance.now();

  // Fresh instance
  db = create({ schema: SCHEMA });

  await vaultIndex.waitReady();
  const allFiles = vaultIndex.allFiles().filter((f) => f.ext === ".md");

  const docs: Array<{
    path: string;
    title: string;
    content: string;
    tags: string;
    headings: string;
  }> = [];

  let skipped = 0;

  for (const file of allFiles) {
    try {
      let raw = await readFile(file.abs, "utf-8");

      // Truncate very large files
      if (raw.length > MAX_CONTENT_SIZE) {
        raw = raw.slice(0, MAX_CONTENT_SIZE);
      }

      const { tags } = extractFrontmatter(raw);
      const headings = extractHeadings(raw);
      const content = stripMarkdown(raw);

      docs.push({
        path: file.rel,
        title: file.stem,
        content,
        tags,
        headings,
      });
    } catch {
      skipped++;
    }
  }

  if (docs.length > 0) {
    insertMultiple(db, docs);
  }

  indexedCount = docs.length;

  // Persist cache
  await persistIndex(vaultPath);

  const elapsed = `${Math.round(performance.now() - start)}ms`;
  return { indexed: docs.length, skipped, elapsed };
}

export async function persistIndex(vaultPath: string): Promise<{ cachePath: string; cacheSize: string }> {
  if (!db) throw new Error("No index to persist");

  const cacheDir = join(vaultPath, CACHE_DIR);
  await mkdir(cacheDir, { recursive: true });

  const serialized = JSON.stringify(save(db));
  const cachePath = join(cacheDir, CACHE_FILE);
  await writeFile(cachePath, serialized);

  const sizeKB = Math.round(serialized.length / 1024);
  return { cachePath: join(CACHE_DIR, CACHE_FILE), cacheSize: `${sizeKB}KB` };
}

export interface SearchOptions {
  term: string;
  limit?: number;
  tolerance?: number;
  boost?: {
    title?: number;
    headings?: number;
    tags?: number;
    content?: number;
  };
  threshold?: number;
  properties?: string[];
  preflight?: boolean;
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  snippet: string;
  tags: string[];
}

export interface SearchResult {
  query: string;
  count: number;
  elapsed: string;
  indexed_files: number;
  hits: SearchHit[];
}

export function executeSearch(
  db: OramaDB,
  options: SearchOptions,
): { count: number; elapsed: string; hits: Array<{ id: string; score: number; document: any }> } {
  const boost = options.boost ?? {};

  const result = search(db, {
    term: options.term,
    properties: (options.properties as any) ?? ["title", "content", "tags", "headings"],
    boost: {
      title: boost.title ?? 3,
      headings: boost.headings ?? 2,
      tags: boost.tags ?? 2.5,
      content: boost.content ?? 1,
    },
    tolerance: options.tolerance ?? 1,
    limit: options.preflight ? 0 : (options.limit ?? 10),
    threshold: options.threshold ?? 0,
  });

  return {
    count: result.count,
    elapsed: result.elapsed.formatted,
    hits: result.hits,
  };
}

/**
 * Get all indexed documents for TF-IDF analysis.
 * Returns raw document data from the index.
 */
export function getAllIndexedDocs(vaultPath: string, vaultIndex: VaultIndex): Array<{
  path: string;
  title: string;
  content: string;
  tags: string;
  headings: string;
}> {
  if (!db) return [];

  // Search with empty term to get all docs
  const result = search(db, {
    term: "",
    limit: 100000,
  });

  return result.hits.map((hit) => ({
    path: hit.document.path as string,
    title: hit.document.title as string,
    content: hit.document.content as string,
    tags: hit.document.tags as string,
    headings: hit.document.headings as string,
  }));
}
