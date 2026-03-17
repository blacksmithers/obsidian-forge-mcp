# Contributing to VaultForge

## Before You Start

Open an issue first to discuss your idea. This avoids duplicate work and ensures alignment with the project direction.

## Development Setup

1. Clone the repo: `git clone https://github.com/blacksmithers/vaultforge.git`
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`
5. Point Claude Desktop at your local build for manual testing

## Project Structure

```
src/
├── tools/
│   ├── notes/                  read, write, edit, edit_regex, append, delete
│   ├── files/                  rename, move
│   ├── links/                  wikilink management (backlinks, update_links)
│   ├── metadata/               frontmatter operations
│   ├── search/                 smart_search, search_vault, search_content, list_dir, recent, daily, status
│   ├── intelligence/           vault_themes, vault_suggest
│   ├── canvas/                 create, read, patch, relayout (dagre auto-layout)
│   └── batch/                  multi-operation execution
├── vault-index.ts              in-memory file index
└── index.ts                    MCP server registration
```

## Adding a New Tool

1. Create the tool file in the appropriate `src/tools/` subdirectory
2. Register it in `src/index.ts` via `server.tool()`
3. Add unit tests in `tests/unit/` mirroring the source path
4. Add integration tests if the tool interacts with other tools
5. Update the README tool table (correct category, accurate description)
6. Add entry to CHANGELOG.md under `[Unreleased]`

## Code Standards

- **TypeScript strict mode** — no exceptions
- **No `any` types** except at JSON parsing boundaries. Use proper generics.
- **Safety defaults on all destructive operations:**
  - `dry_run: true` for edit_regex, batch_rename, update_links
  - `overwrite: false` for write_note
  - `permanent: false` for delete_note
- **Fuzzy path resolution** must be supported wherever a path input exists (read_note, edit_note, append_note, backlinks, frontmatter, etc.)
- **Error messages must be actionable** — tell the user what went wrong AND what to do about it
- **Responses shaped for AI agents** — minimize token consumption, maximize semantic density. No raw coordinate dumps, no unranked result lists.

## Testing

```bash
npm test              # run all tests
npm run test:watch    # watch mode during development
npm run test:coverage # with coverage report
```

Every tool gets its own test file. Every test file covers: happy path, edge cases, error handling, and (where applicable) fuzzy path resolution and dry run safety.

Minimum coverage targets: 80% line coverage, 90% branch coverage on critical paths.

## Pull Request Process

1. Branch from `main`
2. All tests pass: `npm test`
3. Build succeeds: `npm run build`
4. No type errors: `npx tsc --noEmit`
5. Update CHANGELOG.md under `[Unreleased]`
6. PR description explains WHAT changed and WHY

## Areas We'd Love Help With

- New language stemmers for smart search (Orama supports pluggable stemmers)
- Canvas layout algorithms beyond Sugiyama (force-directed, circular)
- Performance optimization for large vaults (10k+ files)
- Windows-specific edge cases (path separators, long paths, Unicode)
- Vault intelligence improvements (semantic similarity, tag-based clustering)
