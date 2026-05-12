# PR Diff Viewer

A small Bun server plus React UI for compact GitHub pull request diffs.

## Run

For development:

```powershell
bun install
bun run dev
```

Open `http://127.0.0.1:5173`.

For the built app:

```powershell
bun install
bun run build
bun start
```

Open `http://localhost:3000`.

Use a GitHub PR URL, or shorthand:

```text
owner/repo#123
```

## Auth

The server authenticates GitHub requests in this order:

1. `GITHUB_TOKEN`
2. `gh auth token`
3. No token, for public PRs only

To use the GitHub CLI, log in once:

```powershell
gh auth login
bun start
```

Or set `GITHUB_TOKEN` before starting the server:

```powershell
$env:GITHUB_TOKEN="github_pat_..."
bun start
```

## Render Caps

The server keeps the React payload small by truncating large diffs before sending them to the browser.

```powershell
$env:MAX_FILES="80"
$env:MAX_LINES_PER_FILE="450"
$env:MAX_LINE_LENGTH="240"
bun start
```
