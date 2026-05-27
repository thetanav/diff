const PORT = Number(process.env.PORT ?? 3000);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MAX_FILES = Number(process.env.MAX_FILES ?? 3000);
const MAX_LINES_PER_FILE = Number(process.env.MAX_LINES_PER_FILE ?? 450);
const MAX_LINE_LENGTH = Number(process.env.MAX_LINE_LENGTH ?? 240);
const PR_FILES_CACHE_TTL_MS = Number(
  process.env.PR_FILES_CACHE_TTL_MS ?? 60_000,
);
let githubTokenPromise: Promise<string | undefined> | undefined;

function log(level: string, msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `\x1b[90m${ts}\x1b[0m \x1b[${level === "error" ? "31" : level === "warn" ? "33" : "36"}m${level.padEnd(5)}\x1b[0m`;
  console.log(`${prefix}  ${msg}`, ...args);
}

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
  status?: string;
  additions: number;
  deletions: number;
  changes?: number;
  patchAvailable?: boolean;
  patchLoaded?: boolean;
  blobUrl?: string;
  rawUrl?: string;
  contentsUrl?: string;
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

type ParsedPr = {
  owner: string;
  repo: string;
  number: string;
  source: string;
};

type GithubPrFile = {
  filename: string;
  previous_filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string;
  blob_url?: string;
  raw_url?: string;
  contents_url?: string;
};

type CachedPrFiles = {
  expiresAt: number;
  files: GithubPrFile[];
};

const prFilesCache = new Map<string, CachedPrFiles>();

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...init.headers,
    },
  });
}

function parsePrInput(input: string): ParsedPr | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i,
  );

  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: urlMatch[3],
      source: `https://github.com/${urlMatch[1]}/${urlMatch[2]}/pull/${urlMatch[3]}`,
    };
  }

  const shortMatch = trimmed.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: shortMatch[3],
      source: `${shortMatch[1]}/${shortMatch[2]}#${shortMatch[3]}`,
    };
  }

  return null;
}

async function readGhCliToken() {
  const proc = Bun.spawn(["gh", "auth", "token"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    console.warn(
      `Could not read GitHub CLI token: ${stderr.trim() || `exit ${exitCode}`}`,
    );
    return undefined;
  }

  return stdout.trim() || undefined;
}

function getGithubToken() {
  if (GITHUB_TOKEN) return Promise.resolve(GITHUB_TOKEN);
  githubTokenPromise ??= readGhCliToken();
  return githubTokenPromise;
}

function getCacheKey(owner: string, repo: string, number: string) {
  return `${owner}/${repo}#${number}`.toLowerCase();
}

async function githubFetch(url: string) {
  const token = await getGithubToken();
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "bun-pr-diff-viewer",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  return response;
}

async function fetchPrFiles(owner: string, repo: string, number: string) {
  const files: GithubPrFile[] = [];
  let page = 1;

  while (files.length < MAX_FILES) {
    const response = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
    );
    const pageFiles = (await response.json()) as GithubPrFile[];

    files.push(...pageFiles.slice(0, Math.max(0, MAX_FILES - files.length)));

    if (pageFiles.length < 100) break;
    page += 1;
  }

  return files;
}

async function getPrFiles(parsed: ParsedPr) {
  const cacheKey = getCacheKey(parsed.owner, parsed.repo, parsed.number);
  const cached = prFilesCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.files;
  }

  const files = await fetchPrFiles(parsed.owner, parsed.repo, parsed.number);
  prFilesCache.set(cacheKey, {
    expiresAt: Date.now() + PR_FILES_CACHE_TTL_MS,
    files,
  });
  return files;
}

function truncateLine(line: string) {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_LINE_LENGTH)}...`;
}

function parseRange(header: string) {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return {
    oldLine: match ? Number(match[1]) : undefined,
    newLine: match ? Number(match[2]) : undefined,
  };
}

function toDiffFileSummary(file: GithubPrFile): DiffFile {
  return {
    oldPath: file.previous_filename ?? file.filename,
    newPath: file.filename,
    status: file.status,
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
    changes: file.changes,
    patchAvailable: Boolean(file.patch),
    patchLoaded: false,
    blobUrl: file.blob_url,
    rawUrl: file.raw_url,
    contentsUrl: file.contents_url,
    omittedLines: 0,
    hunks: [],
  };
}

function parsePatch(file: GithubPrFile): DiffFile {
  const diffFile = toDiffFileSummary(file);
  diffFile.patchLoaded = true;

  if (!file.patch) {
    diffFile.hunks.push({
      header: "Patch unavailable",
      lines: [
        {
          type: "meta",
          content:
            "GitHub did not provide a text patch for this file. It may be binary, too large, or generated.",
        },
      ],
    });
    return diffFile;
  }

  let currentHunk: DiffHunk | undefined;
  let oldLine: number | undefined;
  let newLine: number | undefined;

  for (const rawLine of file.patch.split("\n")) {
    if (rawLine.startsWith("@@ ")) {
      const range = parseRange(rawLine);
      oldLine = range.oldLine;
      newLine = range.newLine;
      currentHunk = { header: rawLine, lines: [] };
      diffFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      currentHunk = { header: "File changes", lines: [] };
      diffFile.hunks.push(currentHunk);
    }

    const visibleLines = diffFile.hunks.reduce(
      (sum, hunk) => sum + hunk.lines.length,
      0,
    );
    if (visibleLines >= MAX_LINES_PER_FILE) {
      diffFile.omittedLines += 1;
      if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
        if (newLine !== undefined) newLine += 1;
      } else if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
        if (oldLine !== undefined) oldLine += 1;
      } else if (rawLine.startsWith(" ")) {
        if (oldLine !== undefined) oldLine += 1;
        if (newLine !== undefined) newLine += 1;
      }
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      currentHunk.lines.push({
        type: "add",
        content: truncateLine(rawLine.slice(1)),
        newLine,
      });
      if (newLine !== undefined) newLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      currentHunk.lines.push({
        type: "remove",
        content: truncateLine(rawLine.slice(1)),
        oldLine,
      });
      if (oldLine !== undefined) oldLine += 1;
      continue;
    }

    if (rawLine.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: truncateLine(rawLine.slice(1)),
        oldLine,
        newLine,
      });
      if (oldLine !== undefined) oldLine += 1;
      if (newLine !== undefined) newLine += 1;
      continue;
    }

    currentHunk.lines.push({ type: "meta", content: truncateLine(rawLine) });
  }

  return diffFile;
}

function findFile(files: GithubPrFile[], path: string) {
  return files.find(
    (file) => file.filename === path || file.previous_filename === path,
  );
}

async function handleDiffSummary(request: Request) {
  const url = new URL(request.url);
  const pr = url.searchParams.get("pr");

  if (!pr) {
    return json(
      {
        error:
          "Pass ?pr=https://github.com/owner/repo/pull/123 or ?pr=owner/repo#123",
      },
      { status: 400 },
    );
  }

  const parsed = parsePrInput(pr);
  if (!parsed) {
    return json(
      {
        error:
          "Could not parse PR input. Use a GitHub PR URL or owner/repo#123.",
      },
      { status: 400 },
    );
  }

  try {
    const files = await getPrFiles(parsed);
    const renderedFiles = files.slice(0, MAX_FILES).map(toDiffFileSummary);
    const payload: DiffPayload = {
      source: parsed.source,
      fetchedAt: new Date().toISOString(),
      fileCount: files.length,
      renderedFileCount: renderedFiles.length,
      omittedFiles: Math.max(0, files.length - renderedFiles.length),
      files: renderedFiles,
    };

    return json(payload, {
      headers: {
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch PR files",
      },
      { status: 502 },
    );
  }
}

async function handleFileDiff(request: Request) {
  const url = new URL(request.url);
  const pr = url.searchParams.get("pr");
  const path = url.searchParams.get("path");

  if (!pr || !path) {
    return json(
      { error: "Pass ?pr=owner/repo#123 and ?path=changed/file.ts" },
      { status: 400 },
    );
  }

  const parsed = parsePrInput(pr);
  if (!parsed) {
    return json(
      {
        error:
          "Could not parse PR input. Use a GitHub PR URL or owner/repo#123.",
      },
      { status: 400 },
    );
  }

  try {
    const files = await getPrFiles(parsed);
    const file = findFile(files, path);

    if (!file) {
      return json(
        { error: `Could not find ${path} in ${parsed.source}` },
        { status: 404 },
      );
    }

    return json(parsePatch(file), {
      headers: {
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch file diff",
      },
      { status: 502 },
    );
  }
}

async function serveStatic(pathname: string) {
  const filePath = pathname === "/" ? "./dist/index.html" : `./dist${pathname}`;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  return new Response(file);
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ status: "ok", uptime: process.uptime() });
    }

    if (url.pathname === "/api/pr-diff") {
      log("info", `GET /api/pr-diff?pr=${url.searchParams.get("pr") ?? ""}`);
      return handleDiffSummary(request);
    }

    if (url.pathname === "/api/pr-file-diff") {
      log("info", `GET /api/pr-file-diff ${url.searchParams.get("path") ?? ""}`);
      return handleFileDiff(request);
    }

    const staticResponse = await serveStatic(url.pathname);
    if (staticResponse) return staticResponse;

    const fallback = Bun.file("./dist/index.html");
    if (await fallback.exists()) return new Response(fallback);

    return json({
      message:
        "PR diff API is running. Use `bunx vite --host 127.0.0.1` for the React dev app or `bun run build` before `bun start`.",
    });
  },
});

function shutdown() {
  log("info", "Shutting down gracefully...");
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const WEBDIFF_PR = process.env.WEBDIFF_PR;
if (WEBDIFF_PR) {
  log("info", `Pre-loaded PR: ${WEBDIFF_PR}`);
}
log("info", `webdiff running at \x1b[1mhttp://localhost:${PORT}\x1b[0m`);
