const PORT = Number(process.env.PORT ?? 3000);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MAX_FILES = Number(process.env.MAX_FILES ?? 80);
const MAX_LINES_PER_FILE = Number(process.env.MAX_LINES_PER_FILE ?? 450);
const MAX_LINE_LENGTH = Number(process.env.MAX_LINE_LENGTH ?? 240);
let githubTokenPromise: Promise<string | undefined> | undefined;

type DiffLineType = "add" | "remove" | "context" | "meta";

type DiffLine = {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
};

type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

type DiffFile = {
  oldPath: string;
  newPath: string;
  additions: number;
  deletions: number;
  omittedLines: number;
  hunks: DiffHunk[];
};

type DiffPayload = {
  source: string;
  fetchedAt: string;
  fileCount: number;
  renderedFileCount: number;
  omittedFiles: number;
  files: DiffFile[];
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

function parsePrInput(input: string) {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i
  );

  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: urlMatch[3],
      source: `https://github.com/${urlMatch[1]}/${urlMatch[2]}/pull/${urlMatch[3]}`
    };
  }

  const shortMatch = trimmed.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: shortMatch[3],
      source: `${shortMatch[1]}/${shortMatch[2]}#${shortMatch[3]}`
    };
  }

  return null;
}

async function readGhCliToken() {
  const proc = Bun.spawn(["gh", "auth", "token"], {
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  if (exitCode !== 0) {
    console.warn(`Could not read GitHub CLI token: ${stderr.trim() || `exit ${exitCode}`}`);
    return undefined;
  }

  return stdout.trim() || undefined;
}

function getGithubToken() {
  if (GITHUB_TOKEN) return Promise.resolve(GITHUB_TOKEN);
  githubTokenPromise ??= readGhCliToken();
  return githubTokenPromise;
}

async function fetchDiff(owner: string, repo: string, number: string) {
  const token = await getGithubToken();
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    {
      headers: {
        accept: "application/vnd.github.v3.diff",
        "user-agent": "bun-pr-diff-viewer",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub returned ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.text();
}

function truncateLine(line: string) {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_LINE_LENGTH)}...`;
}

function parseRange(header: string) {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return {
    oldLine: match ? Number(match[1]) : undefined,
    newLine: match ? Number(match[2]) : undefined
  };
}

function parseDiff(diff: string): DiffPayload {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | undefined;
  let currentHunk: DiffHunk | undefined;
  let oldLine: number | undefined;
  let newLine: number | undefined;

  const ensureFile = () => {
    if (!currentFile) {
      currentFile = {
        oldPath: "",
        newPath: "",
        additions: 0,
        deletions: 0,
        omittedLines: 0,
        hunks: []
      };
      files.push(currentFile);
    }
    return currentFile;
  };

  for (const rawLine of diff.split("\n")) {
    if (rawLine.startsWith("diff --git ")) {
      const match = rawLine.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = {
        oldPath: match?.[1] ?? "",
        newPath: match?.[2] ?? "",
        additions: 0,
        deletions: 0,
        omittedLines: 0,
        hunks: []
      };
      currentHunk = undefined;
      files.push(currentFile);
      continue;
    }

    if (!currentFile) continue;

    if (rawLine.startsWith("--- ")) {
      currentFile.oldPath = rawLine.replace(/^--- a\//, "").replace(/^--- /, "");
      continue;
    }

    if (rawLine.startsWith("+++ ")) {
      currentFile.newPath = rawLine.replace(/^\+\+\+ b\//, "").replace(/^\+\+\+ /, "");
      continue;
    }

    if (rawLine.startsWith("@@ ")) {
      const range = parseRange(rawLine);
      oldLine = range.oldLine;
      newLine = range.newLine;
      currentHunk = { header: rawLine, lines: [] };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      if (rawLine.startsWith("new file mode") || rawLine.startsWith("deleted file mode")) {
        const file = ensureFile();
        file.hunks.push({ header: rawLine, lines: [] });
      }
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      currentFile.additions += 1;
      const visibleLines = currentFile.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
      if (visibleLines >= MAX_LINES_PER_FILE) {
        currentFile.omittedLines += 1;
        if (newLine !== undefined) newLine += 1;
        continue;
      }
      currentHunk.lines.push({
        type: "add",
        content: truncateLine(rawLine.slice(1)),
        newLine
      });
      if (newLine !== undefined) newLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      currentFile.deletions += 1;
      const visibleLines = currentFile.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
      if (visibleLines >= MAX_LINES_PER_FILE) {
        currentFile.omittedLines += 1;
        if (oldLine !== undefined) oldLine += 1;
        continue;
      }
      currentHunk.lines.push({
        type: "remove",
        content: truncateLine(rawLine.slice(1)),
        oldLine
      });
      if (oldLine !== undefined) oldLine += 1;
      continue;
    }

    if (rawLine.startsWith(" ")) {
      const visibleLines = currentFile.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
      if (visibleLines >= MAX_LINES_PER_FILE) {
        currentFile.omittedLines += 1;
        if (oldLine !== undefined) oldLine += 1;
        if (newLine !== undefined) newLine += 1;
        continue;
      }
      currentHunk.lines.push({
        type: "context",
        content: truncateLine(rawLine.slice(1)),
        oldLine,
        newLine
      });
      if (oldLine !== undefined) oldLine += 1;
      if (newLine !== undefined) newLine += 1;
      continue;
    }

    const visibleLines = currentFile.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    if (visibleLines >= MAX_LINES_PER_FILE) {
      currentFile.omittedLines += 1;
      continue;
    }

    currentHunk.lines.push({ type: "meta", content: truncateLine(rawLine) });
  }

  const renderedFiles = files.slice(0, MAX_FILES);

  return {
    source: "",
    fetchedAt: new Date().toISOString(),
    fileCount: files.length,
    renderedFileCount: renderedFiles.length,
    omittedFiles: Math.max(0, files.length - renderedFiles.length),
    files: renderedFiles
  };
}

async function handleApi(request: Request) {
  const url = new URL(request.url);
  const pr = url.searchParams.get("pr");

  if (!pr) {
    return json({ error: "Pass ?pr=https://github.com/owner/repo/pull/123 or ?pr=owner/repo#123" }, { status: 400 });
  }

  const parsed = parsePrInput(pr);
  if (!parsed) {
    return json({ error: "Could not parse PR input. Use a GitHub PR URL or owner/repo#123." }, { status: 400 });
  }

  try {
    const diff = await fetchDiff(parsed.owner, parsed.repo, parsed.number);
    const payload = parseDiff(diff);
    payload.source = parsed.source;
    return json(payload, {
      headers: {
        "cache-control": "public, max-age=60"
      }
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to fetch diff" }, { status: 502 });
  }
}

async function serveStatic(pathname: string) {
  const filePath = pathname === "/" ? "./dist/index.html" : `./dist${pathname}`;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  return new Response(file);
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/pr-diff") {
      return handleApi(request);
    }

    const staticResponse = await serveStatic(url.pathname);
    if (staticResponse) return staticResponse;

    const fallback = Bun.file("./dist/index.html");
    if (await fallback.exists()) return new Response(fallback);

    return json({
      message: "PR diff API is running. Use `bunx vite --host 127.0.0.1` for the React dev app or `bun run build` before `bun start`."
    });
  }
});

console.log(`Bun server listening on http://localhost:${PORT}`);
