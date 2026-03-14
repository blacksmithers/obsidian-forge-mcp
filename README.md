# obsidian-forge-mcp

Blazing-fast local MCP server for Obsidian vault operations. Stdio transport, in-memory filesystem index, zero network latency.

## Why

The remote Obsidian MCP plugin adds HTTP round-trip latency to every operation. For vaults with 1000+ files and workflows that chain read→edit operations, this becomes a productivity bottleneck. **obsidian-forge-mcp** eliminates this entirely:

- **stdio transport** — no HTTP, no SSE, no network stack
- **In-memory vault index** — file lookups are O(1) Map hits, not recursive `readdir`
- **fs.watch** — index stays in sync automatically as files change
- **Batch operations** — up to 50 operations in a single tool call
- **Fuzzy path resolution** — `2025-03-04` resolves to `01-Daily/2025-03-04.md` automatically

## Setup

### 1. Install

```bash
cd obsidian-forge-mcp
npm install
npm run build
```

### 2. Configure Claude Desktop

Edit your Claude Desktop config:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian-forge": {
      "command": "node",
      "args": ["C:\\path\\to\\obsidian-forge-mcp\\dist\\index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "C:\\Users\\YourName\\Documents\\MyVault"
      }
    }
  }
}
```

> **Note**: On Windows, use double backslashes in JSON paths, or forward slashes.

### 3. Restart Claude Desktop

The server starts automatically when Claude Desktop launches.

## Tools (12)

| Tool | Description | Speed |
|------|-------------|-------|
| `vault_status` | Index stats, file count, extensions breakdown | Instant (index) |
| `read_note` | Read note with fuzzy path resolution | ~1ms (disk) |
| `write_note` | Create or overwrite a note | ~1ms (disk) |
| `append_note` | Append to existing note (daily notes, inbox) | ~1ms (disk) |
| `edit_note` | str_replace-style in-place edit | ~2ms (read+write) |
| `delete_note` | Delete (moves to .trash by default) | ~2ms (disk) |
| `list_dir` | List directory contents with glob support | Instant (index) |
| `search_vault` | Search file paths in index | Instant (index) |
| `search_content` | Full-text grep across vault files | ~50-200ms (disk) |
| `recent_notes` | Most recently modified files | Instant (index) |
| `batch` | Execute up to 50 operations in one call | Varies |
| `daily_note` | Quick daily note access/append/create | ~1-2ms (disk) |

## Path Resolution

The server resolves paths intelligently:

1. **Exact match**: `01-Daily/2025-03-04.md` → direct hit
2. **Auto .md**: `01-Daily/2025-03-04` → appends `.md`
3. **Stem search**: `2025-03-04` → finds `01-Daily/2025-03-04.md` by filename
4. **Path search**: `Daily/2025-03` → partial path match

## Batch Example

Single tool call to update 3 files:

```json
{
  "operations": [
    { "op": "append", "path": "01-Daily/2025-03-04", "content": "\n## Meeting Notes\n- Decided on Q2 roadmap" },
    { "op": "write", "path": "20-Projetos/specforge/new-feature.md", "content": "# Feature: Wave Executor\n\n..." },
    { "op": "edit", "path": "60-MOCs/projects", "old_str": "status:: planning", "new_str": "status:: active" }
  ]
}
```

## Architecture

```
Claude Desktop ←→ stdio ←→ obsidian-forge-mcp
                              │
                              ├── VaultIndex (in-memory Map)
                              │     ├── files: Map<relPath, FileEntry>
                              │     ├── byName: Map<stem, Set<relPath>>
                              │     └── byDir: Map<dir, Set<relPath>>
                              │
                              └── fs.watch (recursive, auto-sync)
                                    └── Obsidian detects changes via its own watcher
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OBSIDIAN_VAULT_PATH` | Yes | Absolute path to your Obsidian vault root |

## License

MIT
