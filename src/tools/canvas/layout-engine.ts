import dagre from '@dagrejs/dagre';
import type { CanvasSide, LayoutDirection } from './types.js';
import { calculateEdgeSides } from './canvas-utils.js';

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodesep?: number;
  ranksep?: number;
}

export interface PositionedNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge {
  from: string;
  to: string;
  fromSide: CanvasSide;
  toSide: CanvasSide;
}

export interface LayoutResult {
  nodes: Map<string, PositionedNode>;
  edges: PositionedEdge[];
  hasCycles: boolean;
}

function detectCycles(nodeIds: Set<string>, edges: LayoutEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }
    inStack.delete(node);
    return false;
  }

  for (const node of nodeIds) {
    if (!visited.has(node) && dfs(node)) return true;
  }
  return false;
}

export function runDagreLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: options.direction ?? 'TB',
    nodesep: options.nodesep ?? 80,
    ranksep: options.ranksep ?? 120,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  const hasCycles = detectCycles(nodeIds, validEdges);

  for (const edge of validEdges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  // Read results — convert center coordinates to top-left
  const positionedNodes = new Map<string, PositionedNode>();
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    positionedNodes.set(node.id, {
      x: Math.round(dagreNode.x - dagreNode.width / 2),
      y: Math.round(dagreNode.y - dagreNode.height / 2),
      width: node.width,
      height: node.height,
    });
  }

  // Calculate edge sides based on final node positions
  const positionedEdges: PositionedEdge[] = validEdges.map((edge) => {
    const from = positionedNodes.get(edge.from)!;
    const to = positionedNodes.get(edge.to)!;
    const sides = calculateEdgeSides(from, to);
    return { from: edge.from, to: edge.to, ...sides };
  });

  return { nodes: positionedNodes, edges: positionedEdges, hasCycles };
}
