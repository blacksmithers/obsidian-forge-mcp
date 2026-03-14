import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import type { VaultIndex } from '../../vault-index.js';
import type { CanvasGroupNode } from './types.js';
import { ensureCanvasExt, parseCanvasFile, calculateEdgeSides } from './canvas-utils.js';
import { runDagreLayout } from './layout-engine.js';

export function registerCanvasRelayout(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    'canvas_relayout',
    'Re-layout an existing canvas using dagre without changing content. ' +
      'Useful when a canvas has become visually messy. ' +
      'Set write=false to preview dimensions before committing. ' +
      'Preserves groups and their containment by default.',
    {
      path: z.string().describe('Vault-relative path to .canvas file'),
      direction: z.enum(['TB', 'BT', 'LR', 'RL']).default('LR').describe('Layout direction (default: LR)'),
      nodesep: z.number().optional().describe('Pixels between nodes (default: 80)'),
      ranksep: z.number().optional().describe('Pixels between ranks (default: 120)'),
      root: z.string().optional().describe('Label of root node (layout hint)'),
      preserve_groups: z.boolean().default(true).describe('Keep group containment (default: true)'),
      write: z.boolean().default(false).describe('If false, returns preview without writing'),
    },
    async ({ path: canvasPath, direction, nodesep, ranksep, preserve_groups, write: shouldWrite }) => {
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

      if (canvas.nodes.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              path: rel,
              direction,
              nodes_repositioned: 0,
              edges_recalculated: 0,
              new_dimensions: { width: 0, height: 0 },
              written: false,
            }, null, 2),
          }],
        };
      }

      // Separate groups from regular nodes
      const groupNodes = canvas.nodes.filter((n) => n.type === 'group') as CanvasGroupNode[];
      const regularNodes = canvas.nodes.filter((n) => n.type !== 'group');

      // Detect group membership: which regular nodes are inside which group
      const nodeToGroup = new Map<string, CanvasGroupNode>();
      if (preserve_groups) {
        for (const node of regularNodes) {
          for (const group of groupNodes) {
            if (
              node.x >= group.x &&
              node.y >= group.y &&
              node.x + node.width <= group.x + group.width &&
              node.y + node.height <= group.y + group.height
            ) {
              nodeToGroup.set(node.id, group);
              break;
            }
          }
        }
      }

      // Run dagre on regular nodes
      const layoutNodes = regularNodes.map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
      }));

      const regularNodeIds = new Set(regularNodes.map((n) => n.id));
      const layoutEdges = canvas.edges
        .filter((e) => regularNodeIds.has(e.fromNode) && regularNodeIds.has(e.toNode))
        .map((e) => ({ from: e.fromNode, to: e.toNode }));

      const result = runDagreLayout(layoutNodes, layoutEdges, {
        direction,
        nodesep,
        ranksep,
      });

      // Apply new positions to regular nodes
      for (const node of regularNodes) {
        const pos = result.nodes.get(node.id);
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }

      // Recalculate group bounds from children
      if (preserve_groups) {
        for (const group of groupNodes) {
          const children = regularNodes.filter((n) => nodeToGroup.get(n.id) === group);
          if (children.length === 0) continue;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const child of children) {
            minX = Math.min(minX, child.x);
            minY = Math.min(minY, child.y);
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
          }

          const padding = 40;
          group.x = Math.round(minX - padding);
          group.y = Math.round(minY - padding);
          group.width = Math.round(maxX - minX + padding * 2);
          group.height = Math.round(maxY - minY + padding * 2);
        }
      }

      // Recalculate all edge sides
      const nodeById = new Map(canvas.nodes.map((n) => [n.id, n]));
      for (const edge of canvas.edges) {
        const from = nodeById.get(edge.fromNode);
        const to = nodeById.get(edge.toNode);
        if (from && to) {
          const sides = calculateEdgeSides(from, to);
          edge.fromSide = sides.fromSide;
          edge.toSide = sides.toSide;
        }
      }

      // Rebuild nodes array: groups first (lower z-index), then regular
      canvas.nodes = [...groupNodes, ...regularNodes];

      if (shouldWrite) {
        await writeFile(absPath, JSON.stringify(canvas, null, '\t'), 'utf-8');
      }

      // Calculate new dimensions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of canvas.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: rel,
            direction,
            nodes_repositioned: regularNodes.length,
            edges_recalculated: canvas.edges.length,
            new_dimensions: {
              width: Math.round(maxX - minX),
              height: Math.round(maxY - minY),
            },
            written: shouldWrite,
            ...(result.hasCycles ? { warnings: ['Graph contains cycles — layout may be suboptimal'] } : {}),
          }, null, 2),
        }],
      };
    },
  );
}
