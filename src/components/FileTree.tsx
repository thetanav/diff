import { memo, useMemo, useState, useCallback } from "react";
import { FileIcon, type DiffFile } from "./utils";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: DiffFile;
  depth: number;
};

function buildTree(files: DiffFile[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    children: new Map(),
    depth: 0,
  };

  for (const file of files) {
    const path = file.newPath || file.oldPath;
    const parts = path.split("/");
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
          file: isFile ? file : undefined,
          depth: i,
        };
        node.children.set(part, child);
      }

      node = child;
    }
  }

  return root;
}

type TreeFileEntryProps = {
  file: DiffFile;
  path: string;
  depth: number;
  active: boolean;
  onSelect: (path: string) => void;
};

const TreeFileEntry = memo(function TreeFileEntry({
  file,
  path,
  depth,
  active,
  onSelect,
}: TreeFileEntryProps) {
  return (
    <button
      className={`tree-file ${active ? "tree-file-active" : ""}`}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      onClick={() => onSelect(path)}
    >
      <FileIcon filename={path} className="size-3.5 shrink-0" />
      <span className="truncate">{file.newPath.split("/").pop()}</span>
      <span className="tree-stats">
        {file.additions > 0 ? <span className="add">+{file.additions}</span> : null}
        {file.deletions > 0 ? <span className="remove">-{file.deletions}</span> : null}
      </span>
    </button>
  );
});

type FileTreeProps = {
  files: DiffFile[];
  activePath: string;
  onSelect: (path: string) => void;
};

export const FileTree = memo(function FileTree({
  files,
  activePath,
  onSelect,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleDir = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  function renderNode(node: TreeNode): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const entries = [...node.children.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [name, child] of entries) {
      if (child.file && child.children.size === 0) {
        nodes.push(
          <TreeFileEntry
            key={child.path}
            file={child.file}
            path={child.path}
            depth={child.depth}
            active={child.path === activePath}
            onSelect={onSelect}
          />,
        );
      } else {
        const isCollapsed = collapsed.has(child.path);
        nodes.push(
          <div key={child.path}>
            <button
              className="tree-folder"
              style={{ paddingLeft: `${8 + child.depth * 14}px` }}
              onClick={() => toggleDir(child.path)}
            >
              <ChevronRight
                className={`size-3 tree-folder-chevron ${isCollapsed ? "" : "rotate-90"}`}
              />
              {isCollapsed ? (
                <Folder className="size-3.5 shrink-0 text-[var(--muted)]" />
              ) : (
                <FolderOpen className="size-3.5 shrink-0 text-[var(--accent)]" />
              )}
              <span className="truncate">{name}</span>
            </button>
            {!isCollapsed ? renderNode(child) : null}
          </div>,
        );
      }
    }

    return nodes;
  }

  return <div className="tree">{renderNode(tree)}</div>;
});
