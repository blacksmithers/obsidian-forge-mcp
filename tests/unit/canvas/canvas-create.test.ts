import { describe, it, expect } from "vitest";
import { runDagreLayout } from "../../../src/tools/canvas/layout-engine.js";
import { generateId, calculateNodeDimensions } from "../../../src/tools/canvas/canvas-utils.js";
import type { LayoutNode, LayoutEdge } from "../../../src/tools/canvas/layout-engine.js";

describe("canvas-create layout engine", () => {
  it("dagre layout places nodes without overlap", () => {
    const nodes: LayoutNode[] = [
      { id: "a", width: 250, height: 60 },
      { id: "b", width: 250, height: 60 },
      { id: "c", width: 250, height: 60 },
    ];
    const edges: LayoutEdge[] = [
      { from: "a", to: "c" },
      { from: "b", to: "c" },
    ];

    const result = runDagreLayout(nodes, edges);

    // Check no two nodes overlap
    const positioned = [...result.nodes.values()];
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it("LR direction produces horizontal layout (wider than tall)", () => {
    const nodes: LayoutNode[] = [
      { id: "a", width: 100, height: 60 },
      { id: "b", width: 100, height: 60 },
      { id: "c", width: 100, height: 60 },
    ];
    const edges: LayoutEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];

    const result = runDagreLayout(nodes, edges, { direction: "LR" });
    const positioned = [...result.nodes.values()];

    const minX = Math.min(...positioned.map((n) => n.x));
    const maxX = Math.max(...positioned.map((n) => n.x + n.width));
    const minY = Math.min(...positioned.map((n) => n.y));
    const maxY = Math.max(...positioned.map((n) => n.y + n.height));

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    expect(totalWidth).toBeGreaterThan(totalHeight);
  });

  it("TB direction produces vertical layout (taller than wide)", () => {
    const nodes: LayoutNode[] = [
      { id: "a", width: 100, height: 60 },
      { id: "b", width: 100, height: 60 },
      { id: "c", width: 100, height: 60 },
    ];
    const edges: LayoutEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];

    const result = runDagreLayout(nodes, edges, { direction: "TB" });
    const positioned = [...result.nodes.values()];

    const minX = Math.min(...positioned.map((n) => n.x));
    const maxX = Math.max(...positioned.map((n) => n.x + n.width));
    const minY = Math.min(...positioned.map((n) => n.y));
    const maxY = Math.max(...positioned.map((n) => n.y + n.height));

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    expect(totalHeight).toBeGreaterThan(totalWidth);
  });

  it("handles single node", () => {
    const nodes: LayoutNode[] = [{ id: "solo", width: 250, height: 60 }];
    const edges: LayoutEdge[] = [];

    const result = runDagreLayout(nodes, edges);
    expect(result.nodes.size).toBe(1);
    const solo = result.nodes.get("solo")!;
    expect(solo.width).toBe(250);
    expect(solo.height).toBe(60);
    expect(Number.isFinite(solo.x)).toBe(true);
    expect(Number.isFinite(solo.y)).toBe(true);
  });

  it("generateId produces unique hex strings", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it("calculateNodeDimensions returns correct defaults for text nodes", () => {
    const dims = calculateNodeDimensions({ label: "Test", type: "text" });
    expect(dims.width).toBe(250);
    expect(dims.height).toBeGreaterThan(0);
  });
});
