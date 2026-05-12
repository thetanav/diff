# PR Diff Viewer

A minimal, fast PR diff viewer that strips away GitHub's noise.

Paste any GitHub PR URL (or `owner/repo#123`) and get a clean, compact view of every file change — additions, deletions, and all.

## How it works

```
You paste a PR URL
       │
       ▼
┌─────────────────┐
│  Bun API server │  ← Fetches files via GitHub API (with pagination)
└────────┬────────┘       Auth: GitHub token or `gh auth token`
         │
         ▼
┌─────────────────┐
│  Parse the      │  ← Splits patch hunks (@@ markers), truncates long lines
│  raw diff patch │     Caps at 450 lines per file, 240 chars per line
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  React UI       │  ← Accordion file list, search/filter, dark mode
│  + Tailwind     │     Max rows slider to limit visible diff lines
└─────────────────┘
```

Features:
- Lazy-load individual file diffs on click
- File search filter
- Dark/light mode
- Configurable max rows display
- Uses your `gh` CLI token automatically

## Setup

```bash
bun install
bun run dev
```

Open `http://localhost:3000` and paste a PR URL.

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

React · TypeScript · Bun · Tailwind CSS · React Query · Lucide
