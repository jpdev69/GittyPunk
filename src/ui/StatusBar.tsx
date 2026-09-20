import { useAppStore } from "../state/store";
import type { ViewMode } from "../state/store";
import { houseStatusParts, summarizeHouseState } from "../view/artifact-states";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "working", label: "Working House" },
  { mode: "blueprint", label: "Staged Blueprint" },
  { mode: "snapshot", label: "Commit Snapshot" },
  { mode: "remote", label: "Remote House" },
];

export default function StatusBar() {
  const repo = useAppStore((state) => state.repo);
  const viewMode = useAppStore((state) => state.viewMode);
  const setViewMode = useAppStore((state) => state.setViewMode);
  const summary = summarizeHouseState(repo);
  const parts = houseStatusParts(summary);
  return (
    <header className="status-bar">
      <span className="status-branch">
        {summary.detached
          ? `detached @ ${summary.head}`
          : `on ${summary.branch ?? "no branch"}`}
      </span>
      {summary.ahead > 0 ? (
        <span className="status-ahead">↑{summary.ahead}</span>
      ) : null}
      {summary.behind > 0 ? (
        <span className="status-behind">↓{summary.behind}</span>
      ) : null}
      {summary.unfetched ? (
        <span className="badge-rebase" title="Origin remote house has un-fetched updates">
          UNFETCHED
        </span>
      ) : null}
      {summary.merging ? <span className="badge-merge">MERGING</span> : null}
      {summary.rebasing ? (
        <span className="badge-rebase">REBASING</span>
      ) : null}
      <span className="status-parts">
        {parts.map((part) => (
          <span
            key={part.kind}
            className={`status-part part-${part.kind}`}
          >
            {part.text}
          </span>
        ))}
      </span>
      <span className="view-toggle">
        {VIEW_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={viewMode === mode ? "active" : ""}
            onClick={() => setViewMode(mode)}
          >
            {label}
          </button>
        ))}
      </span>
    </header>
  );
}
