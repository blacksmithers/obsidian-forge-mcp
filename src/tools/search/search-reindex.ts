/**
 * search_reindex — Force re-index of the vault search index.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VaultIndex } from "../../vault-index.js";
import { fullReindex, persistIndex } from "./orama-engine.js";
import { stat } from "node:fs/promises";
import { join } from "node:path";

export function registerSearchReindex(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    "search_reindex",
    "Force re-index of the vault search index. " +
      "Call after bulk file operations or if search results seem stale. " +
      "Index is cached at .vaultforge/search-index.json.",
    {
      force: z
        .boolean()
        .default(true)
        .describe("Full re-index (default: true). If false, only index files newer than cache."),
    },
    async ({ force }) => {
      await vault.waitReady();

      const result = await fullReindex(vaultPath, vault);
      const { cachePath, cacheSize } = await persistIndex(vaultPath);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                indexed: result.indexed,
                skipped: result.skipped,
                elapsed: result.elapsed,
                cache_path: cachePath,
                cache_size: cacheSize,
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
