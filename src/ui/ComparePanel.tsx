import { useMemo } from "react";
import { diffTrees, treeOf } from "../engine";
import { formatDiff } from "../parser/format";
import { useAppStore } from "../state/store";

function diffLineClass(line: string): string {
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("diff --git")) return "diff-meta";
  return "diff-file";
}

export default function ComparePanel() {
  const repo = useAppStore((state) => state.repo);
  const diffView = useAppStore((state) => state.diffView);
  const closeDiff = useAppStore((state) => state.closeDiff);
  const lines = useMemo(() => {
    if (!diffView) return [];
    try {
      const fromTree = treeOf(repo, diffView.from);
      const toTree = treeOf(repo, diffView.to);
      return formatDiff(diffTrees(fromTree, toTree));
    } catch {
      return [];
    }
  }, [repo, diffView]);

  if (!diffView) return null;
  return (
    <aside className="compare-panel">
      <header className="compare-header">
        <h2>Compare</h2>
        <p className="compare-refs">
          {diffView.from} <span className="compare-arrow">→</span>{" "}
          {diffView.to}
        </p>
        <button type="button" className="compare-exit" onClick={closeDiff}>
          Exit compare
        </button>
      </header>
      <div className="compare-lines">
        {lines.length === 0 ? (
          <p className="compare-empty">No differences</p>
        ) : (
          lines.map((line, index) => (
            <p key={index} className={`diff-line ${diffLineClass(line)}`}>
              {line === "" ? " " : line}
            </p>
          ))
        )}
      </div>
    </aside>
  );
}
