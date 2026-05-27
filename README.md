# webdiff

A fast, compact PR diff viewer — run from the terminal, stripped of GitHub's noise.

```bash
npx webdiff https://github.com/owner/repo/pull/123
```

Paste any GitHub PR URL (or `owner/repo#123`) and get a clean, compact view of every file change.

## Features

- **Keyboard-first** — `j`/`k` to navigate files, `/` to search, `c`/`e` to collapse/expand, `?` for help
- **Dark mode** — persisted preference, auto-detects system theme
- **Fast** — lazy-loads file diffs on scroll, virtual-scrolled diff view
- **Search** — filter files by name, collapse/expand all
- **CLI-friendly** — `npx webdiff <pr>` opens directly in browser
- **Your token** — uses `gh auth token` or `GITHUB_TOKEN` automatically

## Usage

```bash
# Open a PR
npx webdiff https://github.com/owner/repo/pull/123
npx webdiff owner/repo#123

# Development
bun install
bun run dev        # Vite + API server
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `GITHUB_TOKEN` | — | GitHub API token |
| `MAX_FILES` | `3000` | Max files to fetch |
| `MAX_LINES_PER_FILE` | `450` | Lines shown per file |
| `MAX_LINE_LENGTH` | `240` | Chars shown per line |
| `PR_FILES_CACHE_TTL_MS` | `60000` | Cache TTL in ms |

## Stack

React 19 · TypeScript · Bun · Tailwind CSS 4 · React Query · Lucide · Geist
