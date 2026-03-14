# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

obsidian-forge-mcp is a local MCP (Model Context Protocol) server for Obsidian vault operations. It communicates via stdio transport with Claude Desktop — no HTTP, no network.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (tsc) → dist/
npm run dev          # Run directly via tsx (no build step)
npm start            # Run compiled output (must build first)
```

There are no tests, linter, or formatter configured.

## Architecture

**`src/index.ts`** — MCP server entry point. Registers 16 tools using `@modelcontextprotocol/sdk`. The 12 vault tools (read_note, write_note, edit_note, delete_note, append_note, list_dir, search_vault, search_content, recent_notes, vault_status, batch, daily_note) are defined inline. The 4 canvas tools are registered via imported functions from `src/tools/canvas/`.

**`src/vault-index.ts`** — `VaultIndex` class maintains three in-memory Maps:
- `files`: relPath → FileEntry (size, mtime, extension)
- `byName`: lowercase filename stem → Set of relPaths (enables fuzzy resolution)
- `byDir`: directory → Set of child paths

Built by recursive `readdir` on startup, kept in sync via `fs.watch` (recursive). Ignores `.obsidian`, `.git`, `.trash`, `node_modules`, dotfiles.

**`src/tools/canvas/`** — Canvas tools module (4 tools). Each tool file exports a `register*` function called from index.ts.
- `types.ts` — TypeScript interfaces for JSON Canvas spec (nodes, edges, semantic input types)
- `canvas-utils.ts` — Shared utilities: ID generation, text height estimation, edge side calculation, fuzzy node matching, relative positioning
- `layout-engine.ts` — dagre wrapper for DAG layout (Sugiyama algorithm). Converts dagre center-origin coordinates to canvas top-left origin
- `canvas-create.ts` — `canvas_create` tool: agent provides semantic graph (labels + edges), tool calculates all geometry via dagre
- `canvas-read.ts` — `canvas_read` tool: reads `.canvas` JSON and returns semantic representation (labels, connections, stats)
- `canvas-patch.ts` — `canvas_patch` tool: add/remove/update nodes and edges with relative positioning
- `canvas-relayout.ts` — `canvas_relayout` tool: re-layout existing canvas via dagre without changing content

**Path resolution** (critical to understand): exact match → append `.md` → stem lookup in `byName` → partial path substring search. This fuzzy resolution is used by all file-operating tools. Canvas tools use `ensureCanvasExt()` instead of `ensureMd()`.

## Key Design Decisions

- **Environment variable `OBSIDIAN_VAULT_PATH`** is required — all paths are resolved relative to this root.
- **Delete safety**: `delete_note` moves to `.trash/` by default; permanent deletion requires explicit `permanent: true`.
- **`edit_note`** uses str_replace semantics — `old_str` must appear exactly once in the file (uniqueness enforced).
- **ES modules**: `"type": "module"` in package.json, `Node16` module resolution in tsconfig.
- **Zod** is used for tool input validation but is a transitive dependency from `@modelcontextprotocol/sdk`, not directly listed in package.json.
- **Canvas tool contract**: the agent works at the semantic graph level (labels + connections), the tool works at the geometry level (coordinates, IDs, edge sides). The agent never touches geometry.
- **dagre coordinates**: dagre returns center-of-node coordinates; canvas uses top-left origin. Always convert: `canvasX = dagreX - width/2`.
- **Canvas JSON format**: tab indentation (`JSON.stringify(data, null, '\t')`) to match Obsidian's native format.
- **Group z-ordering**: groups appear before their children in the nodes array (lower z-index = rendered behind).
