import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import nodePath from 'node:path';
import type { VaultIndex } from '../../vault-index.js';
import type { CanvasNode, CanvasEdge, CanvasData, SemanticNode } from './types.js';
import {
  generateId,
  calculateNodeDimensions,
  ensureCanvasExt,
} from './canvas-utils.js';
import { runDagreLayout } from './layout-engine.js';

const SemanticNodeSchema = z.object({
  label: z.string(),
  type: z.enum(['text', 'file', 'link', 'group']),
  text: z.string().optional(),
  file: z.string().optional(),
  subpath: z.string().optional(),
  url: z.string().optional(),
  children: z.array(z.string()).optional(),
  color: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const SemanticEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
  fromEnd: z.enum(['none', 'arrow']).optional(),
  toEnd: z.enum(['none', 'arrow']).optional(),
});

const LayoutSchema = z.object({
  algorithm: z.literal('dagre').default('dagre'),
  direction: z.enum(['TB', 'BT', 'LR', 'RL']).default('TB'),
  nodesep: z.number().optional(),
  ranksep: z.number().optional(),
}).optional();

export function registerCanvasCreate(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    'canvas_create',
    'Create an Obsidian Canvas (.canvas) file with automatic layout. ' +
      'Provide nodes (label + type + content) and edges (from/to labels). ' +
      'The tool handles all positioning, IDs, and geometry via dagre DAG layout. ' +
      'Supports text, file, link, and group node types. ' +
      'Layout direction: TB (top-bottom), LR (left-right), BT, RL.',
    {
      path: z.string().describe('Vault-relative path for the canvas file (e.g. "projects/architecture.canvas")'),
      nodes: z.array(SemanticNodeSchema).describe('Array of nodes with labels and content'),
      edges: z.array(SemanticEdgeSchema).describe('Array of edges referencing node labels'),
      layout: LayoutSchema.describe('Layout options (algorithm, direction, spacing)'),
      overwrite: z.boolean().default(false).describe('Set true to overwrite existing file'),
    },
    async ({ path: canvasPath, nodes, edges, layout, overwrite }) => {
      await vault.waitReady();

      const rel = ensureCanvasExt(canvasPath);
      const absPath = nodePath.join(vaultPath, rel);

      // Check existing
      if (!overwrite && vault.has(rel)) {
        return {
          content: [{ type: 'text' as const, text: `ERROR: File already exists: ${rel}. Set overwrite=true to replace.` }],
          isError: true,
        };
      }

      // Validate unique labels
      const labels = new Set<string>();
      for (const node of nodes) {
        if (labels.has(node.label)) {
          return {
            content: [{ type: 'text' as const, text: `ERROR: Duplicate node label: "${node.label}"` }],
            isError: true,
          };
        }
        labels.add(node.label);
      }

      // Validate edge references
      for (const edge of edges) {
        if (!labels.has(edge.from)) {
          return {
            content: [{ type: 'text' as const, text: `ERROR: Edge references unknown label: "${edge.from}"` }],
            isError: true,
          };
        }
        if (!labels.has(edge.to)) {
          return {
            content: [{ type: 'text' as const, text: `ERROR: Edge references unknown label: "${edge.to}"` }],
            isError: true,
          };
        }
      }

      // Validate group children
      for (const node of nodes) {
        if (node.type === 'group' && node.children) {
          for (const child of node.children) {
            if (!labels.has(child)) {
              return {
                content: [{ type: 'text' as const, text: `ERROR: Group "${node.label}" references unknown child: "${child}"` }],
                isError: true,
              };
            }
          }
        }
      }

      // Separate groups from regular nodes
      const groupNodes = nodes.filter((n) => n.type === 'group');
      const regularNodes = nodes.filter((n) => n.type !== 'group');

      // Generate IDs: label → id
      const labelToId = new Map<string, string>();
      for (const node of nodes) {
        labelToId.set(node.label, generateId());
      }

      // Calculate dimensions for regular nodes
      const labelToDims = new Map<string, { width: number; height: number }>();
      for (const node of regularNodes) {
        labelToDims.set(node.label, calculateNodeDimensions(node as SemanticNode));
      }

      // Run dagre layout on regular nodes
      const layoutNodes = regularNodes.map((n) => ({
        id: labelToId.get(n.label)!,
        width: labelToDims.get(n.label)!.width,
        height: labelToDims.get(n.label)!.height,
      }));

      const layoutEdges = edges
        .filter((e) => labels.has(e.from) && labels.has(e.to))
        .map((e) => ({
          from: labelToId.get(e.from)!,
          to: labelToId.get(e.to)!,
        }));

      const layoutResult = runDagreLayout(layoutNodes, layoutEdges, {
        direction: layout?.direction ?? 'TB',
        nodesep: layout?.nodesep,
        ranksep: layout?.ranksep,
      });

      // Build canvas nodes array — groups first for z-ordering
      const canvasNodes: CanvasNode[] = [];

      // Process groups (positioned from children's bounding box)
      for (const group of groupNodes) {
        const children = group.children ?? [];
        let gx = 0, gy = 0, gw: number, gh: number;

        if (children.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const childLabel of children) {
            const childId = labelToId.get(childLabel)!;
            const pos = layoutResult.nodes.get(childId);
            if (pos) {
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
              maxX = Math.max(maxX, pos.x + pos.width);
              maxY = Math.max(maxY, pos.y + pos.height);
            }
          }
          const padding = 40;
          gx = Math.round(minX - padding);
          gy = Math.round(minY - padding);
          gw = Math.round(maxX - minX + padding * 2);
          gh = Math.round(maxY - minY + padding * 2);
        } else {
          const dims = calculateNodeDimensions(group as SemanticNode);
          gw = dims.width;
          gh = dims.height;
        }

        const groupNode: CanvasNode = {
          id: labelToId.get(group.label)!,
          type: 'group',
          x: gx,
          y: gy,
          width: gw,
          height: gh,
          ...(group.label ? { label: group.label } : {}),
          ...(group.color ? { color: group.color } : {}),
        } as CanvasNode;
        canvasNodes.push(groupNode);
      }

      // Process regular nodes
      for (const node of regularNodes) {
        const id = labelToId.get(node.label)!;
        const pos = layoutResult.nodes.get(id)!;

        const base = {
          id,
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
          ...(node.color ? { color: node.color } : {}),
        };

        switch (node.type) {
          case 'text':
            canvasNodes.push({ ...base, type: 'text', text: node.text ?? node.label } as CanvasNode);
            break;
          case 'file':
            canvasNodes.push({
              ...base,
              type: 'file',
              file: node.file!,
              ...(node.subpath ? { subpath: node.subpath } : {}),
            } as CanvasNode);
            break;
          case 'link':
            canvasNodes.push({ ...base, type: 'link', url: node.url! } as CanvasNode);
            break;
        }
      }

      // Build canvas edges
      const canvasEdges: CanvasEdge[] = edges.map((e) => {
        const fromId = labelToId.get(e.from)!;
        const toId = labelToId.get(e.to)!;
        const posEdge = layoutResult.edges.find((pe) => pe.from === fromId && pe.to === toId);

        return {
          id: generateId(),
          fromNode: fromId,
          toNode: toId,
          ...(posEdge ? { fromSide: posEdge.fromSide, toSide: posEdge.toSide } : {}),
          ...(e.label ? { label: e.label } : {}),
          ...(e.color ? { color: e.color } : {}),
          ...(e.fromEnd ? { fromEnd: e.fromEnd } : {}),
          ...(e.toEnd ? { toEnd: e.toEnd } : {}),
        };
      });

      // Assemble and write
      const canvasData: CanvasData = { nodes: canvasNodes, edges: canvasEdges };
      await mkdir(nodePath.dirname(absPath), { recursive: true });
      await writeFile(absPath, JSON.stringify(canvasData, null, '\t'), 'utf-8');

      // Calculate total dimensions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of canvasNodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
      }

      const warnings: string[] = [];
      if (layoutResult.hasCycles) {
        warnings.push('Graph contains cycles — layout may be suboptimal');
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: rel,
            nodes: canvasNodes.length,
            edges: canvasEdges.length,
            groups: groupNodes.length,
            dimensions: {
              width: Math.round(maxX - minX),
              height: Math.round(maxY - minY),
            },
            ...(warnings.length > 0 ? { warnings } : {}),
          }, null, 2),
        }],
      };
    },
  );
}
