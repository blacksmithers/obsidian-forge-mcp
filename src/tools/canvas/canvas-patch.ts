import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import type { VaultIndex } from '../../vault-index.js';
import type { CanvasNode, CanvasEdge, SemanticNode } from './types.js';
import {
  generateId,
  ensureCanvasExt,
  parseCanvasFile,
  buildLabelMap,
  fuzzyMatchNode,
  getNodeLabel,
  positionNear,
  calculateNodeDimensions,
  calculateEdgeSides,
  estimateTextHeight,
} from './canvas-utils.js';

const AddNodeSchema = z.object({
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
  near: z.string().describe('Label of existing node to position near'),
  position: z.enum(['above', 'below', 'left', 'right']).describe('Relative direction from anchor'),
  gap: z.number().optional().describe('Pixels gap from anchor (default: 100)'),
});

const AddEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
  fromEnd: z.enum(['none', 'arrow']).optional(),
  toEnd: z.enum(['none', 'arrow']).optional(),
});

const RemoveEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const UpdateNodeSchema = z.object({
  label: z.string().describe('Label of node to update (fuzzy matched)'),
  text: z.string().optional(),
  color: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export function registerCanvasPatch(
  server: McpServer,
  vaultPath: string,
  vault: VaultIndex,
): void {
  server.tool(
    'canvas_patch',
    'Modify an existing canvas: add/remove/update nodes and edges. ' +
      'New nodes are positioned relative to existing ones (near + position). ' +
      'Nodes are matched by label (fuzzy matching). ' +
      'Removing a node cascade-deletes all its connected edges.',
    {
      path: z.string().describe('Vault-relative path to .canvas file'),
      add_nodes: z.array(AddNodeSchema).optional().describe('Nodes to add with relative positioning'),
      add_edges: z.array(AddEdgeSchema).optional().describe('Edges to add between existing/new nodes'),
      remove_nodes: z.array(z.string()).optional().describe('Labels of nodes to remove (cascades to edges)'),
      remove_edges: z.array(RemoveEdgeSchema).optional().describe('Edges to remove (by from/to labels)'),
      update_nodes: z.array(UpdateNodeSchema).optional().describe('Nodes to update (matched by label)'),
    },
    async ({ path: canvasPath, add_nodes, add_edges, remove_nodes, remove_edges, update_nodes }) => {
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
      const labelMap = buildLabelMap(canvas.nodes);

      let addedNodes = 0, removedNodes = 0, addedEdges = 0, removedEdges = 0, updatedNodes = 0;

      // 1. Remove nodes (cascade-delete connected edges)
      if (remove_nodes) {
        for (const label of remove_nodes) {
          const node = fuzzyMatchNode(label, labelMap);
          if (!node) continue;

          const beforeEdges = canvas.edges.length;
          canvas.edges = canvas.edges.filter((e) => e.fromNode !== node.id && e.toNode !== node.id);
          removedEdges += beforeEdges - canvas.edges.length;

          canvas.nodes = canvas.nodes.filter((n) => n.id !== node.id);
          labelMap.delete(getNodeLabel(node));
          removedNodes++;
        }
      }

      // 2. Remove specific edges
      if (remove_edges) {
        for (const re of remove_edges) {
          const fromNode = fuzzyMatchNode(re.from, labelMap);
          const toNode = fuzzyMatchNode(re.to, labelMap);
          if (!fromNode || !toNode) continue;

          const beforeCount = canvas.edges.length;
          canvas.edges = canvas.edges.filter(
            (e) => !(e.fromNode === fromNode.id && e.toNode === toNode.id),
          );
          removedEdges += beforeCount - canvas.edges.length;
        }
      }

      // 3. Update existing nodes
      if (update_nodes) {
        for (const update of update_nodes) {
          const node = fuzzyMatchNode(update.label, labelMap);
          if (!node) continue;

          if (update.text !== undefined && node.type === 'text') {
            (node as { text: string }).text = update.text;
            // Recalculate height if text changed and no explicit height
            if (update.height === undefined) {
              node.height = estimateTextHeight(update.text, update.width ?? node.width);
            }
          }
          if (update.color !== undefined) node.color = update.color;
          if (update.width !== undefined) node.width = update.width;
          if (update.height !== undefined) node.height = update.height;

          updatedNodes++;
        }
      }

      // 4. Add new nodes
      if (add_nodes) {
        for (const newNode of add_nodes) {
          if (fuzzyMatchNode(newNode.label, labelMap)) {
            return {
              content: [{ type: 'text' as const, text: `ERROR: Node with label "${newNode.label}" already exists` }],
              isError: true,
            };
          }

          const anchor = fuzzyMatchNode(newNode.near, labelMap);
          if (!anchor) {
            return {
              content: [{ type: 'text' as const, text: `ERROR: Cannot find anchor node "${newNode.near}"` }],
              isError: true,
            };
          }

          const dims = calculateNodeDimensions(newNode as SemanticNode);
          const pos = positionNear(anchor, dims, newNode.position, newNode.gap);
          const id = generateId();

          const base = {
            id,
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            width: dims.width,
            height: dims.height,
            ...(newNode.color ? { color: newNode.color } : {}),
          };

          let canvasNode: CanvasNode;
          switch (newNode.type) {
            case 'text':
              canvasNode = { ...base, type: 'text', text: newNode.text ?? newNode.label } as CanvasNode;
              break;
            case 'file':
              canvasNode = {
                ...base,
                type: 'file',
                file: newNode.file!,
                ...(newNode.subpath ? { subpath: newNode.subpath } : {}),
              } as CanvasNode;
              break;
            case 'link':
              canvasNode = { ...base, type: 'link', url: newNode.url! } as CanvasNode;
              break;
            case 'group':
              canvasNode = {
                ...base,
                type: 'group',
                ...(newNode.label ? { label: newNode.label } : {}),
              } as CanvasNode;
              break;
            default:
              canvasNode = { ...base, type: 'text', text: newNode.label } as CanvasNode;
          }

          canvas.nodes.push(canvasNode);
          labelMap.set(getNodeLabel(canvasNode), canvasNode);
          addedNodes++;
        }
      }

      // 5. Add new edges
      if (add_edges) {
        for (const newEdge of add_edges) {
          const fromNode = fuzzyMatchNode(newEdge.from, labelMap);
          const toNode = fuzzyMatchNode(newEdge.to, labelMap);

          if (!fromNode) {
            return {
              content: [{ type: 'text' as const, text: `ERROR: Cannot find source node "${newEdge.from}"` }],
              isError: true,
            };
          }
          if (!toNode) {
            return {
              content: [{ type: 'text' as const, text: `ERROR: Cannot find target node "${newEdge.to}"` }],
              isError: true,
            };
          }

          const sides = calculateEdgeSides(fromNode, toNode);

          const edge: CanvasEdge = {
            id: generateId(),
            fromNode: fromNode.id,
            fromSide: sides.fromSide,
            toNode: toNode.id,
            toSide: sides.toSide,
            ...(newEdge.label ? { label: newEdge.label } : {}),
            ...(newEdge.color ? { color: newEdge.color } : {}),
            ...(newEdge.fromEnd ? { fromEnd: newEdge.fromEnd } : {}),
            ...(newEdge.toEnd ? { toEnd: newEdge.toEnd } : {}),
          };

          canvas.edges.push(edge);
          addedEdges++;
        }
      }

      // Write back
      await writeFile(absPath, JSON.stringify(canvas, null, '\t'), 'utf-8');

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: rel,
            added_nodes: addedNodes,
            removed_nodes: removedNodes,
            added_edges: addedEdges,
            removed_edges: removedEdges,
            updated_nodes: updatedNodes,
            total_nodes: canvas.nodes.length,
            total_edges: canvas.edges.length,
          }, null, 2),
        }],
      };
    },
  );
}
