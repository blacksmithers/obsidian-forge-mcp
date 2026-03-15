import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCanvasFile } from "../../../src/tools/canvas/canvas-utils.js";
import { runDagreLayout } from "../../../src/tools/canvas/layout-engine.js";
import type { LayoutNode, LayoutEdge } from "../../../src/tools/canvas/layout-engine.js";

let vaultPath: string;
let vault: VaultIndex;

beforeAll(async () => {
  vaultPath = await createTempVault();
  vault = await createVaultIndex(vaultPath);
});

afterAll(async () => {
  vault.destroy();
  await cleanupTempVault(vaultPath);
});

describe("canvas-relayout", () => {
  it("relayout produces valid positions for all nodes", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);

    const layoutNodes: LayoutNode[] = data.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    }));
    const layoutEdges: LayoutEdge[] = data.edges.map((e) => ({
      from: e.fromNode,
      to: e.toNode,
    }));

    const result = runDagreLayout(layoutNodes, layoutEdges);
    expect(result.nodes.size).toBe(3);

    for (const node of data.nodes) {
      expect(result.nodes.has(node.id)).toBe(true);
    }
  });

  it("positions are finite numbers", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);

    const layoutNodes: LayoutNode[] = data.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    }));
    const layoutEdges: LayoutEdge[] = data.edges.map((e) => ({
      from: e.fromNode,
      to: e.toNode,
    }));

    const result = runDagreLayout(layoutNodes, layoutEdges);

    for (const [_id, pos] of result.nodes) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
      expect(Number.isFinite(pos.width)).toBe(true);
      expect(Number.isFinite(pos.height)).toBe(true);
    }
  });

  it("edges get sides calculated", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);

    const layoutNodes: LayoutNode[] = data.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    }));
    const layoutEdges: LayoutEdge[] = data.edges.map((e) => ({
      from: e.fromNode,
      to: e.toNode,
    }));

    const result = runDagreLayout(layoutNodes, layoutEdges);

    expect(result.edges.length).toBe(2);
    const validSides = ["top", "right", "bottom", "left"];
    for (const edge of result.edges) {
      expect(validSides).toContain(edge.fromSide);
      expect(validSides).toContain(edge.toSide);
      expect(edge.from).toBeDefined();
      expect(edge.to).toBeDefined();
    }
  });

  it("relayout does not report cycles for acyclic graph", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);

    const layoutNodes: LayoutNode[] = data.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    }));
    const layoutEdges: LayoutEdge[] = data.edges.map((e) => ({
      from: e.fromNode,
      to: e.toNode,
    }));

    const result = runDagreLayout(layoutNodes, layoutEdges);
    expect(result.hasCycles).toBe(false);
  });
});
