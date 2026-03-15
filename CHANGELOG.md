# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] (0.4.0)

### Added
- `list_dir` now returns subdirectories with child counts (`include_dirs` parameter, default: true)
- `smart_search` adds `mode` parameter: `auto` (OR + BM25 ranking), `all` (AND), `any` (OR) — default changed to `auto` for better multi-term recall
- `search_content` now includes `match_count` per file and sorts results by match density (most matches first)
- Comprehensive test suite (150+ tests) using vitest
- CONTRIBUTING.md with development guidelines
- CHANGELOG.md (this file)
- GitHub Actions CI workflow (Ubuntu, Windows, macOS × Node 22)
- Roadmap section in README

### Changed
- Minimum Node.js version updated to >=22 (Node 18 EOL Apr 2025, Node 20 EOL Apr 2026)
- `list_dir` response shape changed: `{ directory, count, directories: [...], files: [...] }` (previously `{ directory, count, files: [...] }`)
- `search_content` results now sorted by `match_count` descending instead of file scan order

### Fixed
- `list_dir` no longer hides subdirectories — directories are now listed separately with child counts
- `smart_search` multi-term queries now return results matching any term (OR mode) with BM25 ranking, instead of requiring all terms (AND mode) which caused poor recall

## [0.3.1] - 2026-03-15

### Fixed
- Vault path now correctly resolved from CLI arguments with environment variable fallback

## [0.3.0] - 2026-03-15

### Fixed
- Corrected naming conventions across all tools and exports

## [0.2.0] - 2026-03-15

### Added
- `frontmatter` — Read/write/merge YAML frontmatter as structured data
- `edit_regex` — Regex find-and-replace with capture groups, single file or vault-wide grep-sub
- `batch_rename` — Rename/move files with automatic wikilink updates
- `update_links` — Update all wikilinks across vault after moves/renames
- `backlinks` — Find all files linking to a target with line numbers and context
- Enhanced `list_dir` with sorting and glob pattern support

## [0.1.0] - 2026-03-14

### Added
- Initial release with 20 tools
- Core note operations: read, write, edit, append, delete
- Search: smart_search (BM25 via Orama), search_vault, search_content, recent_notes
- Canvas tools: create, read, patch, relayout (dagre auto-layout)
- Vault intelligence: vault_themes (TF-IDF clustering), vault_suggest (reorganization engine)
- Batch operations, daily notes, vault status
- In-memory file index with real-time fs.watch sync
- Persistent search index at `.obsidian-forge/search-index.json`
