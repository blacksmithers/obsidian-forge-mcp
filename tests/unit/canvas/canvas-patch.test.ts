import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempVault, cleanupTempVault, createVaultIndex } from "../../helpers.js";
import type { VaultIndex } from "../../../src/vault-index.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCanvasFile, getNodeLabel, buildLabelMap, fuzzyMatchNode } from "../../../src/tools/canvas/canvas-utils.js";
import type { CanvasNode } from "../../../src/tools/canvas/types.js";

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

describe("canvas-patch utilities", () => {
  it("buildLabelMap creates map from nodes", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const labelMap = buildLabelMap(data.nodes);

    expect(labelMap.size).toBe(3);
    expect(labelMap.has("First Node")).toBe(true);
    expect(labelMap.has("Second Node")).toBe(true);
    expect(labelMap.has("Third Node")).toBe(true);
  });

  it("fuzzyMatchNode finds exact match", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const labelMap = buildLabelMap(data.nodes);

    const match = fuzzyMatchNode("First Node", labelMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe("node1");
  });

  it("fuzzyMatchNode finds partial match", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const labelMap = buildLabelMap(data.nodes);

    const match = fuzzyMatchNode("First", labelMap);
    expect(match).not.toBeNull();
    expect(getNodeLabel(match!)).toBe("First Node");
  });

  it("fuzzyMatchNode returns null for no match", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const labelMap = buildLabelMap(data.nodes);

    const match = fuzzyMatchNode("Nonexistent Node", labelMap);
    expect(match).toBeNull();
  });

  it("removing a node and filtering edges works", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);

    // Remove node3 and filter out edges referencing it
    const nodeToRemove = "node3";
    const filteredNodes = data.nodes.filter((n) => n.id !== nodeToRemove);
    const filteredEdges = data.edges.filter(
      (e) => e.fromNode !== nodeToRemove && e.toNode !== nodeToRemove,
    );

    expect(filteredNodes.length).toBe(2);
    expect(filteredEdges.length).toBe(0);
  });

  it("fuzzyMatchNode is case-insensitive", async () => {
    const content = await readFile(path.join(vaultPath, "canvas/test-canvas.canvas"), "utf-8");
    const data = parseCanvasFile(content);
    const labelMap = buildLabelMap(data.nodes);

    const match = fuzzyMatchNode("first node", labelMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe("node1");
  });
});
