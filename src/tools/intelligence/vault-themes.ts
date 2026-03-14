/**
 * vault_themes — Scan vault and extract dominant themes via TF-IDF + clustering.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VaultIndex } from "../../vault-index.js";
import { ensureIndex, getAllIndexedDocs } from "../search/orama-engine.js";
import { computeTfIdf, type FileFingerprint } from "./tfidf.js";
import { clusterFiles, type ThemeCluster } from "./clustering.js";

export interface ThemeMap {
  total_files: number;
  indexed_files: number;
  themes: Array<
    ThemeCluster & { file_count: number }
  >;
  orphans: Array<{ path: string; reason: string }>;
  cross_folder_warnings: Array<{
    theme_id: string;
    folders: string[];
    suggestion: string;
  }>;
}

export async function computeThemeMap(
  vaultPath: string,
  vault: VaultIndex,
  options: {
    minClusterSize: number;
    maxThemes: number;
    excludeFolders: string[];
    depth: "shallow" | "deep";
  },
): Promise<ThemeMap> {
  await ensureIndex(vaultPath, vault);

  const allDocs = getAllIndexedDocs(vaultPath, vault);
  const totalFiles = vault.allFiles().length;

  // Filter excluded folders
  const docs = allDocs.filter((doc) => {
    return !options.excludeFolders.some((folder) =>
      doc.path.startsWith(folder + "/") || doc.path.startsWith(folder + "\\"),
    );
  });

  // Prepare content for TF-IDF based on depth
  const tfidfInput = docs.map((doc) => ({
    path: doc.path,
    title: doc.title,
    content:
      options.depth === "shallow"
        ? `${doc.title} ${doc.headings}`
        : `${doc.title} ${doc.headings} ${doc.content}`,
  }));

  // Compute fingerprints and cluster
  const fingerprints = computeTfIdf(tfidfInput);
  const clusters = clusterFiles(fingerprints, options.minClusterSize);

  // Limit to maxThemes
  const themes = clusters.slice(0, options.maxThemes).map((c) => ({
    ...c,
    file_count: c.files.length,
  }));

  // Find orphans — files not in any cluster
  const clusteredPaths = new Set(themes.flatMap((t) => t.files));
  const orphans = docs
    .filter((doc) => !clusteredPaths.has(doc.path))
    .map((doc) => ({
      path: doc.path,
      reason: "No strong theme affinity",
    }));

  // Cross-folder warnings
  const crossFolderWarnings = themes
    .filter((t) => t.crossFolder)
    .map((t) => ({
      theme_id: t.id,
      folders: t.folders,
      suggestion: "Theme spans multiple folders — consider consolidating",
    }));

  return {
    total_files: totalFiles,
    indexed_files: docs.length,
    themes,
    orphans,
    cross_folder_warnings: crossFolderWarnings,
  };
}

export function registerVaultThemes(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    "vault_themes",
    "Scan the vault and extract dominant themes using TF-IDF analysis. " +
      "Returns a thematic atlas: clusters of related files, cross-folder warnings, " +
      "and orphan files. Use before vault_suggest for reorganization planning.",
    {
      min_cluster_size: z.number().default(3).describe("Minimum files per theme (default: 3)"),
      max_themes: z.number().default(15).describe("Maximum themes to return (default: 15)"),
      exclude_folders: z
        .array(z.string())
        .default([])
        .describe('Folders to exclude (e.g. ["90-Archive", "Templates"])'),
      depth: z
        .enum(["shallow", "deep"])
        .default("deep")
        .describe("shallow = titles+headings only (faster), deep = full content (better)"),
    },
    async ({ min_cluster_size, max_themes, exclude_folders, depth }) => {
      await vault.waitReady();

      const themeMap = await computeThemeMap(vaultPath, vault, {
        minClusterSize: min_cluster_size,
        maxThemes: max_themes,
        excludeFolders: exclude_folders,
        depth,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(themeMap, null, 2),
          },
        ],
      };
    },
  );
}
