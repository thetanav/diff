import { useMemo, useState } from "react";
import { DiffFileView, samplePr, type DiffPayload } from "./components/utils";
import { useQuery } from "@tanstack/react-query";

function App() {
  const [pr, setPr] = useState("");
  const [submittedPr, setSubmittedPr] = useState("");
  const [filter, setFilter] = useState("");
  const [maxRows, setMaxRows] = useState(10);

  const {
    data: payload,
    error,
    isFetching,
    refetch,
  } = useQuery<DiffPayload>({
    queryKey: ["pr", submittedPr],
    enabled: false,
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

  function loadDiff(event: any) {
    event.preventDefault();
    setSubmittedPr(pr.trim());
    refetch();
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
        <h1 className="font-bold">PR Diff Viewer</h1>
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
            <label className="summary-control">
              <span>Max rows</span>
              <input
                aria-label="Max rows"
                type="number"
                min={1}
                max={100}
                step={1}
                value={maxRows}
                onChange={(event) =>
                  setMaxRows(Math.max(1, Number(event.target.value || 0)))
                }
              />
            </label>
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
                maxRows={maxRows}
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

export default App;
