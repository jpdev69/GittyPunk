import { useMemo } from "react";
import { useAppStore } from "../state/store";
import { historyEntries } from "../view/history-model";

export default function HistoryPanel() {
  const repo = useAppStore((state) => state.repo);
  const travelCommit = useAppStore((state) => state.travelCommit);
  const setTravelCommit = useAppStore((state) => state.setTravelCommit);
  const diffView = useAppStore((state) => state.diffView);
  const entries = useMemo(() => historyEntries(repo), [repo]);

  if (diffView) return null;
  return (
    <aside className="history-panel">
      <h2>History</h2>
      <ol className="history-list">
        {entries.map((entry) => {
          const traveling = travelCommit === entry.id;
          return (
            <li key={entry.id} className={traveling ? "traveling" : ""}>
              <button
                type="button"
                onClick={() => setTravelCommit(traveling ? null : entry.id)}
                title={traveling ? "Return to working house" : "View snapshot"}
              >
                <span className="commit-dot" />
                <span className="commit-sha">{entry.shortId}</span>
                <span className="commit-message">{entry.message}</span>
                {entry.isHead ? (
                  <span className="tip tip-head">HEAD</span>
                ) : null}
                {entry.tips.map((tip) => (
                  <span
                    key={tip}
                    className={`tip ${tip.startsWith("origin/") ? "tip-remote" : "tip-local"}`}
                  >
                    {tip}
                  </span>
                ))}
                {entry.unpushed ? (
                  <span className="tip tip-unpushed">↑</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      {travelCommit ? (
        <button
          type="button"
          className="history-return"
          onClick={() => setTravelCommit(null)}
        >
          Return to working house
        </button>
      ) : null}
    </aside>
  );
}
