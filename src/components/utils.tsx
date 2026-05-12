import { memo, useMemo, useState } from "react";

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
  additions: number;
  deletions: number;
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
