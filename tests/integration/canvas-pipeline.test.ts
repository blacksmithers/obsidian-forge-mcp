import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";
import {
  parseCanvasFile,
  getNodeLabel,
  buildLabelMap,
  fuzzyMatchNode,
} from "../../src/tools/canvas/canvas-utils.js";
import { runDagreLayout } from "../../src/tools/canvas/layout-engine.js";

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

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

describe("Canvas pipeline", () => {
  it("read test-canvas.canvas → parse → verify 3 nodes", async () => {
    const raw = await readVaultFile(vaultPath, "canvas/test-canvas.canvas");
    const canvas = parseCanvasFile(raw);

    expect(canvas.nodes).toHaveLength(3);
    expect(canvas.edges).toHaveLength(2);

    // Verify node IDs
    const nodeIds = canvas.nodes.map((n) => n.id);
    expect(nodeIds).toContain("node1");
    expect(nodeIds).toContain("node2");
    expect(nodeIds).toContain("node3");
  });

  it("parse → get labels → verify node labels", async () => {
    const raw = await readVaultFile(vaultPath, "canvas/test-canvas.canvas");
    const canvas = parseCanvasFile(raw);

    const labels = canvas.nodes.map((n) => getNodeLabel(n));
    expect(labels).toContain("First Node");
    expect(labels).toContain("Second Node");
    expect(labels).toContain("Third Node");
  });

  it("buildLabelMap → fuzzyMatchNode finds nodes", async () => {
    const raw = await readVaultFile(vaultPath, "canvas/test-canvas.canvas");
    const canvas = parseCanvasFile(raw);
    const labelMap = buildLabelMap(canvas.nodes);

    // Exact match
    const exact = fuzzyMatchNode("First Node", labelMap);
    expect(exact).not.toBeNull();
    expect(exact!.id).toBe("node1");

    // Case-insensitive
    const caseInsensitive = fuzzyMatchNode("second node", labelMap);
    expect(caseInsensitive).not.toBeNull();
    expect(caseInsensitive!.id).toBe("node2");

    // Starts with
    const startsWith = fuzzyMatchNode("Third", labelMap);
    expect(startsWith).not.toBeNull();
    expect(startsWith!.id).toBe("node3");

    // Contains
    const contains = fuzzyMatchNode("Second", labelMap);
    expect(contains).not.toBeNull();
    expect(contains!.id).toBe("node2");

    // No match
    const noMatch = fuzzyMatchNode("Nonexistent Node", labelMap);
    expect(noMatch).toBeNull();
  });

  it("runDagreLayout with canvas data produces valid positions", async () => {
    const raw = await readVaultFile(vaultPath, "canvas/test-canvas.canvas");
    const canvas = parseCanvasFile(raw);

    const layoutNodes = canvas.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    }));

    const layoutEdges = canvas.edges.map((e) => ({
      from: e.fromNode,
      to: e.toNode,
    }));

    const result = runDagreLayout(layoutNodes, layoutEdges, { direction: "TB" });

    // All nodes should have positions
    expect(result.nodes.size).toBe(3);

    for (const [id, pos] of result.nodes) {
      expect(typeof pos.x).toBe("number");
      expect(typeof pos.y).toBe("number");
      expect(pos.width).toBeGreaterThan(0);
      expect(pos.height).toBeGreaterThan(0);
    }

    // Edges should have side information
    expect(result.edges).toHaveLength(2);
    for (const edge of result.edges) {
      expect(["top", "bottom", "left", "right"]).toContain(edge.fromSide);
      expect(["top", "bottom", "left", "right"]).toContain(edge.toSide);
    }

    // In TB layout, node3 (child) should be below node1 and node2 (parents)
    const node1Pos = result.nodes.get("node1")!;
    const node3Pos = result.nodes.get("node3")!;
    expect(node3Pos.y).toBeGreaterThan(node1Pos.y);

    expect(result.hasCycles).toBe(false);
  });
});
