/**
 * smart_search — BM25-ranked full-text search tool.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VaultIndex } from "../../vault-index.js";
import { ensureIndex, executeSearch, getIndexedCount } from "./orama-engine.js";
import { extractSnippet } from "./markdown-parser.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function registerSmartSearch(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    "smart_search",
    "BM25-ranked full-text search across vault notes. " +
      "Returns results scored by relevance with snippets. " +
      "Supports typo tolerance, field boosting (title > headings > tags > content), " +
      "and term matching modes (auto/all/any). Default 'auto' uses OR matching with " +
      "BM25 ranking for best recall — documents matching more terms score higher naturally.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().default(10).describe("Max results (default: 10)"),
      tolerance: z.number().default(1).describe("Typo tolerance / edit distance (0 = exact, default: 1)"),
      boost: z
        .object({
          title: z.number().optional(),
          headings: z.number().optional(),
          tags: z.number().optional(),
          content: z.number().optional(),
        })
        .optional()
        .describe("Field boosting overrides (defaults: title=3, headings=2, tags=2.5, content=1)"),
      threshold: z.number().default(0).describe("Min score 0-1 to include (default: 0)"),
      mode: z
        .enum(["auto", "all", "any"])
        .default("auto")
        .describe("Term matching: 'auto' (OR + BM25 ranking, best recall), 'all' (AND, all terms required), 'any' (OR, any term matches). Default: auto"),
      properties: z
        .array(z.string())
        .optional()
        .describe("Fields to search (default: all)"),
      preflight: z
        .boolean()
        .default(false)
        .describe("Count only, no hits returned (default: false)"),
    },
    async ({ query, limit, tolerance, boost, threshold, mode, properties, preflight }) => {
      await vault.waitReady();
      const db = await ensureIndex(vaultPath, vault);

      // Map mode to Orama threshold parameter
      // threshold=0 means all terms required (AND), threshold=1 means any term matches (OR)
      let effectiveThreshold = threshold;
      if (mode === "auto" || mode === "any") {
        effectiveThreshold = 1;
      } else if (mode === "all") {
        effectiveThreshold = 0;
      }

      const result = executeSearch(db, {
        term: query,
        limit,
        tolerance,
        boost,
        threshold: effectiveThreshold,
        properties,
        preflight,
      });

      // Build hits with snippets
      const hits = await Promise.all(
        result.hits.map(async (hit) => {
          const doc = hit.document;
          let snippet = "";
          try {
            const raw = await readFile(join(vaultPath, doc.path), "utf-8");
            snippet = extractSnippet(raw, query);
          } catch {
            snippet = extractSnippet(doc.content as string, query);
          }

          const tags = (doc.tags as string)
            .split(/\s+/)
            .filter((t: string) => t.length > 0);

          // Normalize score: max score from first hit
          const maxScore = result.hits[0]?.score ?? 1;
          const normalizedScore = Math.round((hit.score / maxScore) * 100) / 100;

          return {
            path: doc.path as string,
            title: doc.title as string,
            score: normalizedScore,
            snippet,
            tags,
          };
        }),
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                count: result.count,
                elapsed: result.elapsed,
                indexed_files: getIndexedCount(),
                hits,
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
