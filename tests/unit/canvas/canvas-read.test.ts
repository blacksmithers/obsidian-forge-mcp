import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex, readVaultFile } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCanvasFile, getNodeLabel } from "../../../src/tools/canvas/canvas-utils.js";

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

describe("canvas-read", () => {
  it("reads existing canvas file and parses nodes", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    expect(data.nodes).toBeDefined();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
  });

  it("identifies node labels correctly", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const labels = data.nodes.map((n) => getNodeLabel(n));
    expect(labels).toContain("First Node");
    expect(labels).toContain("Second Node");
    expect(labels).toContain("Third Node");
  });

  it("has correct node count (3) and edge count (2)", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    expect(data.nodes.length).toBe(3);
    expect(data.edges.length).toBe(2);
  });

  it("identifies root nodes (nodes with no incoming edges)", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);

    const nodesWithIncoming = new Set(data.edges.map((e) => e.toNode));
    const rootNodes = data.nodes.filter((n) => !nodesWithIncoming.has(n.id));
    const rootLabels = rootNodes.map((n) => getNodeLabel(n));

    expect(rootLabels).toContain("First Node");
    expect(rootLabels).toContain("Second Node");
    expect(rootLabels).not.toContain("Third Node");
    expect(rootNodes.length).toBe(2);
  });

  it("handles missing canvas file gracefully", async () => {
    let error: Error | null = null;
    try {
      const content = await readFile(path.join(vaultPath, "canvas/nonexistent.canvas"), "utf-8");
      parseCanvasFile(content);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error!.message).toContain("ENOENT");
  });

  it("edges reference valid node IDs", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    for (const edge of data.edges) {
      expect(nodeIds.has(edge.fromNode)).toBe(true);
      expect(nodeIds.has(edge.toNode)).toBe(true);
    }
  });
});
