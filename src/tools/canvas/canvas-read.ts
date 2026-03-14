import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import nodePath from 'node:path';
import type { VaultIndex } from '../../vault-index.js';
import { ensureCanvasExt, parseCanvasFile, getNodeLabel } from './canvas-utils.js';

export function registerCanvasRead(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    'canvas_read',
    'Read an Obsidian Canvas and return its semantic structure. ' +
      'Returns node labels, types, and connections (not raw coordinates). ' +
      "Use format='summary' for overview or format='full' for positions. " +
      'Labels can be used with canvas_patch to modify the canvas.',
    {
      path: z.string().describe('Vault-relative path to .canvas file'),
      format: z.enum(['summary', 'full']).default('summary').describe("'summary' for overview, 'full' includes positions"),
    },
    async ({ path: canvasPath, format }) => {
      await vault.waitReady();

      const rel = ensureCanvasExt(canvasPath);
      const absPath = nodePath.join(vaultPath, rel);

      let raw: string;
      try {
        raw = await readFile(absPath, 'utf-8');
      } catch {
        return {
          content: [{ type: 'text' as const, text: `ERROR: Canvas not found: ${rel}` }],
          isError: true,
        };
      }

      const canvas = parseCanvasFile(raw);

      // Build id → label map
      const idToLabel = new Map<string, string>();
      for (const node of canvas.nodes) {
        idToLabel.set(node.id, getNodeLabel(node));
      }

      // Find root nodes (no incoming edges)
      const hasIncoming = new Set(canvas.edges.map((e) => e.toNode));
      const roots = canvas.nodes
        .filter((n) => !hasIncoming.has(n.id))
        .map((n) => idToLabel.get(n.id)!);

      // Type counts
      const types: Record<string, number> = { text: 0, file: 0, link: 0, group: 0 };
      for (const node of canvas.nodes) types[node.type]++;

      // Dimensions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of canvas.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      }

      // Build node summaries
      const nodeSummaries = canvas.nodes.map((node) => {
        const label = idToLabel.get(node.id)!;
        const connectionsOut = canvas.edges
          .filter((e) => e.fromNode === node.id)
          .map((e) => idToLabel.get(e.toNode) ?? e.toNode);
        const connectionsIn = canvas.edges
          .filter((e) => e.toNode === node.id)
          .map((e) => idToLabel.get(e.fromNode) ?? e.fromNode);

        const summary: Record<string, unknown> = {
          id: node.id.slice(0, 4) + '...',
          label,
          type: node.type,
        };

        if (connectionsOut.length > 0) summary.connections_out = connectionsOut;
        if (connectionsIn.length > 0) summary.connections_in = connectionsIn;

        if (format === 'full') {
          summary.x = node.x;
          summary.y = node.y;
          summary.width = node.width;
          summary.height = node.height;
          if (node.color) summary.color = node.color;
        }

        return summary;
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: rel,
            stats: {
              nodes: canvas.nodes.length,
              edges: canvas.edges.length,
              types,
              roots,
              dimensions: canvas.nodes.length > 0
                ? { minX: Math.round(minX), maxX: Math.round(maxX), minY: Math.round(minY), maxY: Math.round(maxY) }
                : null,
            },
            nodes: nodeSummaries,
          }, null, 2),
        }],
      };
    },
  );
}
