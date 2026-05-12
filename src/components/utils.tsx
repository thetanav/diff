import { useQuery } from "@tanstack/react-query";
import { ChevronRight, File } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

const extIcons: Record<string, string> = {
  ts: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg",
  tsx: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  js: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
  jsx: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  md: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg",
  json: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/json/json-original.svg",
  py: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
  css: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg",
  html: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg",
  gitignore:
    "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg",
};

export function FileIcon({
  filename,
  className = "w-5 h-5",
}: {
  filename: string;
  className?: string;
}) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const extKey = ext === "gitignore" ? "gitignore" : ext;
  const iconUrl = extIcons[extKey];

  if (iconUrl) {
    return <img src={iconUrl} className={className} alt={ext} />;
  }

  return <File className={className} />;
}

export type DiffLineType = "add" | "remove" | "context" | "meta";

export type DiffLine = {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type DiffFile = {
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

export type DiffRow =
  | { kind: "hunk"; header: string }
  | { kind: "line"; line: DiffLine };

export type DiffPayload = {
  source: string;
  fetchedAt: string;
  fileCount: number;
  renderedFileCount: number;
  omittedFiles: number;
  files: DiffFile[];
};

export const samplePr = "owner/repo#123";

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

export const DiffLineRow = memo(function DiffLineRow({
  line,
}: {
  line: DiffLine;
}) {
  return (
    <div className={lineClass(line.type)}>
      <span className="line-num">{line.oldLine ?? ""}</span>
      <span className="line-num">{line.newLine ?? ""}</span>
      <span className="line-mark">{linePrefix(line.type)}</span>
      <code>{line.content || " "}</code>
    </div>
  );
});

export const DiffFileView = memo(function DiffFileView({
  file,
  defaultOpen,
  maxRows,
  pr,
}: {
  file: DiffFile;
  defaultOpen: boolean;
  maxRows: number;
  pr: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const path = file.newPath || file.oldPath;
  const [scrollTop, setScrollTop] = useState(0);
  const [isInView, setIsInView] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement | null>(null);
  const rowHeight = 24;
  const maxVisibleRows = Math.max(1, Math.floor(maxRows));

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const patchQuery = useQuery<DiffFile>({
    queryKey: ["pr-file-diff", pr, path],
    enabled: Boolean(
      pr && isInView && file.patchAvailable && !file.patchLoaded,
    ),
    queryFn: async () => {
      const response = await fetch(
        `/api/pr-file-diff?pr=${encodeURIComponent(pr)}&path=${encodeURIComponent(path)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load file patch");
      }

      return data as DiffFile;
    },
    staleTime: 60_000,
  });

  const currentFile = patchQuery.data ?? file;
  const patchError = patchQuery.error;

  const rows = useMemo<DiffRow[]>(() => {
    const result: DiffRow[] = [];
    for (const hunk of currentFile.hunks) {
      result.push({ kind: "hunk", header: hunk.header });
      for (const line of hunk.lines) {
        result.push({ kind: "line", line });
      }
    }
    return result;
  }, [currentFile]);

  const lineCount = useMemo(
    () =>
      currentFile.hunks.reduce((count, hunk) => count + hunk.lines.length, 0),
    [currentFile],
  );

  const totalRows = rows.length;
  const maxStart = Math.max(0, totalRows - maxVisibleRows);
  const startIndex = Math.max(
    0,
    Math.min(maxStart, Math.floor(scrollTop / rowHeight)),
  );
  const endIndex = Math.min(totalRows, startIndex + maxVisibleRows);
  const visibleRows = rows.slice(startIndex, endIndex + 5);
  const spacerHeight = totalRows * rowHeight;
  const viewportHeight =
    Math.max(1, Math.min(totalRows, maxVisibleRows)) * rowHeight;

  return (
    <section className="file" ref={sectionRef}>
      <button
        className="px-3 py-2 flex justify-between items-center select-none w-full cursor-pointer sticky z-100"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex gap-2 items-center">
          <ChevronRight
            className={`transition size-4 ${open ? "rotate-90" : ""}`}
          />
          <FileIcon filename={path} className="w-4 h-4" />
          <p className="mono text-sm">{path}</p>
        </div>
        <span className="stats">
          {currentFile.status ? <span>{currentFile.status}</span> : null}
          <b className="add">+{currentFile.additions}</b>
          <b className="remove">-{currentFile.deletions}</b>
          <span>{lineCount} lines</span>
        </span>
      </button>
      {open ? (
        <div
          className="diff"
          aria-label={`${path} diff`}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          style={{ height: `${viewportHeight}px` }}
        >
          {patchQuery.isFetching ? (
            <div className="omitted">Loading patch…</div>
          ) : null}
          {patchError ? (
            <div className="omitted">
              {patchError instanceof Error
                ? patchError.message
                : "Failed to load file patch"}
            </div>
          ) : null}
          {!patchQuery.isFetching && !patchError && rows.length === 0 ? (
            <div className="omitted">
              No text patch available for this file.
            </div>
          ) : null}
          <div className="diff-spacer" style={{ height: `${spacerHeight}px` }}>
            <div
              className="diff-window"
              style={{ paddingTop: `${startIndex * rowHeight}px` }}
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
          {currentFile.omittedLines > 0 ? (
            <div className="omitted">
              {currentFile.omittedLines} lines hidden by the server cap
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
