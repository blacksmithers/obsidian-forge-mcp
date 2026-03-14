import { randomBytes } from 'node:crypto';
import nodePath from 'node:path';
import type { CanvasNode, CanvasData, CanvasSide, SemanticNode } from './types.js';

export function generateId(): string {
  return randomBytes(8).toString('hex');
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(nodePath.extname(filePath).toLowerCase());
}

export function estimateTextHeight(text: string, width: number = 250): number {
  const charsPerLine = Math.floor(width / 8);
  const lines = text.split('\n').reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  return Math.max(60, lines * 28 + 20);
}

export function calculateNodeDimensions(node: SemanticNode): { width: number; height: number } {
  if (node.width !== undefined && node.height !== undefined) {
    return { width: node.width, height: node.height };
  }

  switch (node.type) {
    case 'text': {
      const w = node.width ?? 250;
      const text = node.text ?? node.label;
      const h = node.height ?? estimateTextHeight(text, w);
      return { width: w, height: h };
    }
    case 'file': {
      if (node.file && isImageFile(node.file)) {
        return { width: node.width ?? 400, height: node.height ?? 200 };
      }
      return { width: node.width ?? 400, height: node.height ?? 400 };
    }
    case 'link':
      return { width: node.width ?? 300, height: node.height ?? 60 };
    case 'group':
      return { width: node.width ?? 400, height: node.height ?? 300 };
    default:
      return { width: node.width ?? 250, height: node.height ?? 60 };
  }
}

export function calculateEdgeSides(
  fromNode: { x: number; y: number; width: number; height: number },
  toNode: { x: number; y: number; width: number; height: number },
): { fromSide: CanvasSide; toSide: CanvasSide } {
  const fromCx = fromNode.x + fromNode.width / 2;
  const fromCy = fromNode.y + fromNode.height / 2;
  const toCx = toNode.x + toNode.width / 2;
  const toCy = toNode.y + toNode.height / 2;

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      fromSide: dx > 0 ? 'right' : 'left',
      toSide: dx > 0 ? 'left' : 'right',
    };
  } else {
    return {
      fromSide: dy > 0 ? 'bottom' : 'top',
      toSide: dy > 0 ? 'top' : 'bottom',
    };
  }
}

export function getNodeLabel(node: CanvasNode): string {
  switch (node.type) {
    case 'text': {
      const text = node.text.split('\n')[0];
      return text.length > 50 ? text.slice(0, 50) + '...' : text;
    }
    case 'file':
      return nodePath.basename(node.file);
    case 'link':
      return node.url;
    case 'group':
      return node.label ?? '(unnamed group)';
  }
}

export function buildLabelMap(nodes: CanvasNode[]): Map<string, CanvasNode> {
  const map = new Map<string, CanvasNode>();
  for (const node of nodes) {
    map.set(getNodeLabel(node), node);
  }
  return map;
}

export function fuzzyMatchNode(query: string, candidates: Map<string, CanvasNode>): CanvasNode | null {
  // 1. Exact match
  if (candidates.has(query)) return candidates.get(query)!;
  // 2. Case-insensitive match
  for (const [label, node] of candidates) {
    if (label.toLowerCase() === query.toLowerCase()) return node;
  }
  // 3. Starts with
  for (const [label, node] of candidates) {
    if (label.toLowerCase().startsWith(query.toLowerCase())) return node;
  }
  // 4. Contains
  for (const [label, node] of candidates) {
    if (label.toLowerCase().includes(query.toLowerCase())) return node;
  }
  return null;
}

export function positionNear(
  anchor: { x: number; y: number; width: number; height: number },
  newNode: { width: number; height: number },
  position: 'above' | 'below' | 'left' | 'right',
  gap: number = 100,
): { x: number; y: number } {
  switch (position) {
    case 'above':
      return {
        x: anchor.x + (anchor.width - newNode.width) / 2,
        y: anchor.y - newNode.height - gap,
      };
    case 'below':
      return {
        x: anchor.x + (anchor.width - newNode.width) / 2,
        y: anchor.y + anchor.height + gap,
      };
    case 'left':
      return {
        x: anchor.x - newNode.width - gap,
        y: anchor.y + (anchor.height - newNode.height) / 2,
      };
    case 'right':
      return {
        x: anchor.x + anchor.width + gap,
        y: anchor.y + (anchor.height - newNode.height) / 2,
      };
  }
}

export function parseCanvasFile(content: string): CanvasData {
  const data = JSON.parse(content);
  return {
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
  };
}

export function ensureCanvasExt(p: string): string {
  const normalized = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.endsWith('.canvas')) return normalized + '.canvas';
  return normalized;
}
