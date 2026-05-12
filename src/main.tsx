import React, { FormEvent, memo, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

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

type DiffRow =
  | { kind: "hunk"; header: string }
  | { kind: "line"; line: DiffLine };

type DiffPayload = {
  source: string;
  fetchedAt: string;
  fileCount: number;
  renderedFileCount: number;
  omittedFiles: number;
  files: DiffFile[];
};

const samplePr = "owner/repo#123";

function lineClass(type: DiffLineType) {
  if (type === "add") return "diff-line is-add";
  if (type === "remove") return "diff-line is-remove";
  if (type === "meta") return "diff-line is-meta";
  return "diff-line";
}

function linePrefix(type: DiffLineType) {
  if (type === "add") return "+";
  if (type === "remove") return "-";
  return " ";
}

const DiffLineRow = memo(function DiffLineRow({ line }: { line: DiffLine }) {
  return (
    <div className={lineClass(line.type)}>
      <span className="line-num">{line.oldLine ?? ""}</span>
      <span className="line-num">{line.newLine ?? ""}</span>
      <span className="line-mark">{linePrefix(line.type)}</span>
      <code>{line.content || " "}</code>
    </div>
  );
});

const DiffFileView = memo(function DiffFileView({
  file,
  defaultOpen,
}: {
  file: DiffFile;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const path = file.newPath || file.oldPath;
  const [scrollTop, setScrollTop] = useState(0);
  const maxVisibleRows = 30;
  const rowHeight = 24;

  const rows = useMemo<DiffRow[]>(() => {
    const result: DiffRow[] = [];
    for (const hunk of file.hunks) {
      result.push({ kind: "hunk", header: hunk.header });
      for (const line of hunk.lines) {
        result.push({ kind: "line", line });
      }
    }
    return result;
  }, [file]);

  const lineCount = useMemo(
    () => file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0),
    [file],
  );

  const totalRows = rows.length;
  const maxStart = Math.max(0, totalRows - maxVisibleRows);
  const startIndex = Math.max(
    0,
    Math.min(maxStart, Math.floor(scrollTop / rowHeight)),
  );
  const endIndex = Math.min(totalRows, startIndex + maxVisibleRows);
  const visibleRows = rows.slice(startIndex, endIndex);
  const spacerHeight = totalRows * rowHeight;
  const viewportHeight = Math.min(totalRows, maxVisibleRows) * rowHeight;

  return (
    <section className="file">
      <button className="file-head" onClick={() => setOpen((value) => !value)}>
        <span className="twisty">{open ? "v" : ">"}</span>
        <span className="path" title={path}>
          {path}
        </span>
        <span className="stats">
          <b className="add">+{file.additions}</b>
          <b className="remove">-{file.deletions}</b>
          <span>{lineCount} shown</span>
        </span>
      </button>
      {open ? (
        <div
          className="diff"
          aria-label={`${path} diff`}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          style={{ height: `${viewportHeight}px` }}
        >
          <div className="diff-spacer" style={{ height: `${spacerHeight}px` }}>
            <div
              className="diff-window"
              style={{ transform: `translateY(${startIndex * rowHeight}px)` }}
            >
              {visibleRows.map((row, rowIndex) =>
                row.kind === "hunk" ? (
                  <div className="hunk-head" key={`${row.header}-${rowIndex}`}>
                    {row.header}
                  </div>
                ) : (
                  <DiffLineRow
                    line={row.line}
                    key={`${rowIndex}-${row.line.content}`}
                  />
                ),
              )}
            </div>
          </div>
          {file.omittedLines > 0 ? (
            <div className="omitted">
              {file.omittedLines} lines hidden by the server cap
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});

function App() {
  const [pr, setPr] = useState("");
  const [submittedPr, setSubmittedPr] = useState("");
  const [filter, setFilter] = useState("");

  const {
    data: payload,
    error,
    isFetching,
  } = useQuery<DiffPayload>({
    queryKey: ["pr", submittedPr],
    enabled: submittedPr.trim().length > 0,
    queryFn: async () => {
      const response = await fetch(
        `/api/pr-diff?pr=${encodeURIComponent(submittedPr)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load PR diff");
      }

      return data;
    },
  });

  function loadDiff(event: FormEvent) {
    event.preventDefault();
    setSubmittedPr(pr.trim());
  }

  const files = useMemo(() => {
    if (!payload) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return payload.files;
    return payload.files.filter((file) =>
      `${file.oldPath} ${file.newPath}`.toLowerCase().includes(needle),
    );
  }, [payload, filter]);

  const totals = useMemo(() => {
    if (!payload) return { additions: 0, deletions: 0 };
    return payload.files.reduce(
      (sum, file) => ({
        additions: sum.additions + file.additions,
        deletions: sum.deletions + file.deletions,
      }),
      { additions: 0, deletions: 0 },
    );
  }, [payload]);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>PR Diff Viewer</h1>
        </div>
        <form onSubmit={loadDiff}>
          <input
            aria-label="Pull request"
            value={pr}
            onChange={(event) => setPr(event.target.value)}
            placeholder={`GitHub PR URL or ${samplePr}`}
          />
          <button disabled={isFetching || pr.trim().length === 0}>
            {isFetching ? "Loading" : "Fetch"}
          </button>
        </form>
      </header>

      {error ? (
        <div className="error">
          {error instanceof Error ? error.message : "Failed to load PR diff"}
        </div>
      ) : null}

      {payload ? (
        <>
          <section className="summary">
            <div>
              <span>Files</span>
              <strong>
                {payload.renderedFileCount}/{payload.fileCount}
              </strong>
            </div>
            <div>
              <span>Additions</span>
              <strong className="add">+{totals.additions}</strong>
            </div>
            <div>
              <span>Deletions</span>
              <strong className="remove">-{totals.deletions}</strong>
            </div>
            <input
              aria-label="Filter files"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter files"
            />
          </section>

          {payload.omittedFiles > 0 ? (
            <div className="notice">
              {payload.omittedFiles} files hidden by the server cap
            </div>
          ) : null}

          <div className="files">
            {files.map((file, index) => (
              <DiffFileView
                file={file}
                defaultOpen={index < 2}
                key={`${file.oldPath}-${file.newPath}`}
              />
            ))}
          </div>
        </>
      ) : (
        <section className="empty">
          Enter a GitHub pull request to render a compact diff.
        </section>
      )}
    </main>
  );
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
