import { useMemo, useState, useEffect, type FormEvent } from "react";
import { DiffFileView, samplePr, type DiffPayload } from "./components/utils";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Moon, Search, Sun } from "lucide-react";

function App() {
  const [pr, setPr] = useState("");
  const [submittedPr, setSubmittedPr] = useState("");
  const [filter, setFilter] = useState("");
  const [maxRows, setMaxRows] = useState(20);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const {
    data: payload,
    error,
    isFetching,
    refetch,
  } = useQuery<DiffPayload>({
    queryKey: ["pr", submittedPr],
    enabled: submittedPr.length > 0,
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

  function loadDiff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPr = pr.trim();

    if (!nextPr) return;

    if (nextPr === submittedPr) {
      void refetch();
      return;
    }

    setSubmittedPr(nextPr);
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
      <header className="flex justify-between items-center pb-4 px-3">
        <h1 className="font-bold">PR Diff Viewer</h1>
        <div className="flex items-center gap-1">
          <form onSubmit={loadDiff} className="flex-1">
            <input
              aria-label="Pull request"
              className="border border-gray-400 bg-white rounded-md px-2 w-64 outline-none"
              value={pr}
              onChange={(event) => setPr(event.target.value)}
              placeholder={`GitHub PR URL or ${samplePr}`}
            />
            <button
              disabled={isFetching || pr.trim().length === 0}
              className="px-3 py-2 flex gap-2 items-center justify-center rounded-lg bg-green-600 hover:bg-green-700 transition text-white cursor-pointer disabled::bg-green-600/20 disabled:cursor-not-allowed"
            >
              {isFetching && <Loader2 className="size-4 animate-spin" />} Fetch
            </button>
          </form>
        </div>
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
                className="outline-none"
                min={1}
                max={100}
                step={1}
                value={maxRows}
                onChange={(event) =>
                  setMaxRows(Math.max(1, Number(event.target.value || 0)))
                }
              />
            </label>
            <div className="w-full flex gap-2 items-center justify-end">
              <Search className="size-4 text-gray-500" />
              <input
                aria-label="Filter files"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter files"
                className="outline-none"
              />
            </div>
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
                pr={submittedPr}
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
