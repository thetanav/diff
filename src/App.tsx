import {
  useMemo,
  useState,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import {
  DiffFileView,
  samplePr,
  type DiffPayload,
} from "./components/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Search,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  Keyboard,
  ExternalLink,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { FileTree } from "./components/FileTree";

function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch { /* noop */ }
        return resolved;
      });
    },
    [key],
  );

  return [value, set] as const;
}

function useKeyboard(
  shortcuts: { key: string; handler: () => void }[],
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        if (e.key !== "Escape") return;
      }
      for (const s of shortcuts) {
        if (e.key === s.key && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, enabled]);
}

function getInitialPr() {
  if (typeof window === "undefined") return "";
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

function systemPrefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

type HelpModalProps = {
  open: boolean;
  onClose: () => void;
};

function HelpModal({ open, onClose }: HelpModalProps) {
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const shortcuts = [
    { key: "j", desc: "Next file" },
    { key: "k", desc: "Previous file" },
    { key: "/", desc: "Focus search" },
    { key: "c", desc: "Collapse all" },
    { key: "e", desc: "Expand all" },
    { key: "?", desc: "Toggle this help" },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <Keyboard className="size-4" />
          <span>Keyboard Shortcuts</span>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {shortcuts.map((s) => (
            <div className="shortcut-row" key={s.key}>
              <kbd className="shortcut-key">{s.key}</kbd>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [pr, setPr] = useState(getInitialPr);
  const [submittedPr, setSubmittedPr] = useState(getInitialPr);
  const [filter, setFilter] = useState("");
  const [maxRows, setMaxRows] = useLocalStorage("webdiff-max-rows", 20);
  const [dark, setDark] = useLocalStorage(
    "webdiff-dark",
    systemPrefersDark(),
  );
  const [showHelp, setShowHelp] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const filterRef = useRef<HTMLInputElement | null>(null);

  type OpenAction =
    | { type: "toggle"; path: string }
    | { type: "collapse" }
    | { type: "expand"; paths: string[] };

  const [openSet, dispatch] = useReducer(
    (state: Set<string>, action: OpenAction) => {
      switch (action.type) {
        case "toggle": {
          const next = new Set(state);
          if (next.has(action.path)) next.delete(action.path);
          else next.add(action.path);
          return next;
        }
        case "collapse":
          return new Set();
        case "expand":
          return new Set(action.paths);
      }
    },
    new Set<string>(),
  ) as [Set<string>, React.Dispatch<OpenAction>];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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
      const data = (await response.json()) as DiffPayload & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load PR diff");
      }

      return data;
    },
    retry: 1,
    meta: { isInitialLoad: true },
  });

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

  const filePaths = useMemo(
    () => files.map((f) => f.newPath || f.oldPath),
    [files],
  );

  const collapseAll = useCallback(() => dispatch({ type: "collapse" }), []);
  const expandAll = useCallback(
    () => dispatch({ type: "expand", paths: filePaths }),
    [filePaths],
  );

  function toggleFile(path: string) {
    dispatch({ type: "toggle", path });
  }

  function loadDiff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPr = pr.trim();

    if (!nextPr) return;

    if (nextPr === submittedPr) {
      void refetch();
      return;
    }

    setSubmittedPr(nextPr);
    setFocusedIndex(-1);
  }

  const navigateFiles = useCallback(
    (dir: number) => {
      if (filePaths.length === 0) return;
      setFocusedIndex((prev) => {
        const next = prev + dir;
        if (next < 0) return filePaths.length - 1;
        if (next >= filePaths.length) return 0;
        return next;
      });
    },
    [filePaths.length],
  );

  const [sidebarOpen, setSidebarOpen] = useLocalStorage("webdiff-sidebar", true);

  useKeyboard(
    [
      { key: "j", handler: () => navigateFiles(1) },
      { key: "k", handler: () => navigateFiles(-1) },
      { key: "/", handler: () => filterRef.current?.focus() },
      { key: "c", handler: collapseAll },
      { key: "e", handler: expandAll },
      { key: "?", handler: () => setShowHelp((v) => !v) },
    ],
    true,
  );

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>webdiff</h1>
          <p className="tagline">
            A compact PR diff viewer —{" "}
            {submittedPr ? (
              <a
                href={submittedPr.startsWith("http") ? submittedPr : `https://github.com/${submittedPr}`}
                target="_blank"
                rel="noreferrer"
                className="source-link"
              >
                <span className="truncate">{submittedPr}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              "paste a URL to start"
            )}
          </p>
        </div>
        <form onSubmit={loadDiff} className="pr-form">
          <input
            aria-label="Pull request"
            className="pr-input"
            value={pr}
            onChange={(event) => setPr(event.target.value)}
            placeholder={`GitHub PR URL or ${samplePr}`}
            spellCheck={false}
          />
          <button
            disabled={isFetching || pr.trim().length === 0}
            className="btn btn-primary"
          >
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronDown className="size-4 -rotate-90" />
            )}
            Fetch
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
            <div className="summary-stat">
              <span>Files</span>
              <strong>
                {payload.renderedFileCount}
                <span className="dim">/{payload.fileCount}</span>
              </strong>
            </div>
            <div className="summary-stat">
              <span>Additions</span>
              <strong className="add">+{totals.additions}</strong>
            </div>
            <div className="summary-stat">
              <span>Deletions</span>
              <strong className="remove">-{totals.deletions}</strong>
            </div>

            <div className="summary-divider" />

            <div className="summary-control">
              <Search className="size-3.5" />
              <input
                ref={filterRef}
                aria-label="Filter files"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={`${files.length} files…`}
                className="outline-none bg-transparent min-w-0 w-full"
                spellCheck={false}
              />
            </div>

            <div className="summary-control">
              <span className="summary-label">Rows</span>
              <input
                aria-label="Max rows"
                type="number"
                className="w-14 outline-none bg-transparent"
                min={1}
                max={200}
                step={1}
                value={maxRows}
                onChange={(event) =>
                  setMaxRows(Math.max(1, Number(event.target.value || 0)))
                }
              />
            </div>

            <div className="summary-actions">
              <button
                className="btn btn-ghost"
                onClick={collapseAll}
                title="Collapse all (c)"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                className="btn btn-ghost"
                onClick={expandAll}
                title="Expand all (e)"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setDark((v) => !v)}
                title="Toggle dark mode"
              >
                {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowHelp((v) => !v)}
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="size-3.5" />
              </button>
              <button
                className={`btn btn-ghost ${sidebarOpen ? "active" : ""}`}
                onClick={() => setSidebarOpen((v) => !v)}
                title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose className="size-3.5" /> : <PanelLeft className="size-3.5" />}
              </button>
            </div>
          </section>

          {payload.omittedFiles > 0 ? (
            <div className="notice">
              {payload.omittedFiles} file{payload.omittedFiles === 1 ? "" : "s"}{" "}
              hidden by server cap (MAX_FILES)
            </div>
          ) : null}

          <div className={`app-content ${sidebarOpen ? "with-sidebar" : ""}`}>
            {sidebarOpen ? (
              <aside className="sidebar">
                <div className="sidebar-header">
                  <span className="sidebar-title">Files</span>
                  <span className="dim text-xs">{files.length}</span>
                </div>
                <FileTree
                  files={files}
                  activePath={filePaths[focusedIndex] ?? ""}
                  onSelect={(path) => {
                    const idx = filePaths.indexOf(path);
                    if (idx !== -1) {
                      setFocusedIndex(idx);
                      toggleFile(path);
                    }
                  }}
                />
              </aside>
            ) : null}
            <div className="files">
              {files.length === 0 ? (
                <div className="empty">No files match your filter.</div>
              ) : (
                files.map((file, index) => (
                  <DiffFileView
                    key={`${file.oldPath}-${file.newPath}`}
                    file={file}
                    open={openSet.has(file.newPath || file.oldPath)}
                    onToggle={() => toggleFile(file.newPath || file.oldPath)}
                    maxRows={maxRows}
                    pr={submittedPr}
                    focused={index === focusedIndex}
                  />
                ))
              )}
            </div>
          </div>
        </>
      ) : submittedPr && isFetching ? (
        <div className="loading">
          <Loader2 className="size-5 animate-spin" />
          <span>Fetching PR diff…</span>
        </div>
      ) : !submittedPr ? (
        <section className="empty empty-hero">
          <h2>Enter a GitHub Pull Request</h2>
          <p>
            Paste a GitHub PR URL like{" "}
            <code>https://github.com/owner/repo/pull/123</code> or use the
            shorthand <code>owner/repo#123</code>.
          </p>
          <p className="dim">
            Uses your <code>gh</code> CLI token or <code>GITHUB_TOKEN</code> env
            var for API access.
          </p>
        </section>
      ) : null}

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </main>
  );
}

export default App;
