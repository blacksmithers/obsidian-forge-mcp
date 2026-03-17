import { cp, rm, mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultIndex } from "../src/vault-index.js";

const FIXTURE_VAULT = path.join(import.meta.dirname, "fixtures", "test-vault");

export async function createTempVault(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "vaultforge-test-"));
  await cp(FIXTURE_VAULT, tempDir, { recursive: true });
  return tempDir;
}

export async function cleanupTempVault(vaultPath: string): Promise<void> {
  await rm(vaultPath, { recursive: true, force: true });
}

export async function createVaultIndex(vaultPath: string): Promise<VaultIndex> {
  const vault = new VaultIndex(vaultPath);
  await vault.init();
  return vault;
}

/** Helper to get absolute path in a temp vault */
export function vaultAbs(vaultPath: string, relPath: string): string {
  return path.join(vaultPath, relPath);
}

/** Read a file in the temp vault */
export async function readVaultFile(vaultPath: string, relPath: string): Promise<string> {
  return readFile(path.join(vaultPath, relPath), "utf-8");
}

/** Write a file in the temp vault */
export async function writeVaultFile(vaultPath: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(vaultPath, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf-8");
}
