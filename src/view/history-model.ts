import { ancestorsOf, headCommit, logQuery } from "../engine";
import type { Repository } from "../engine";

export interface HistoryEntry {
  id: string;
  shortId: string;
  message: string;
  tips: string[];
  isHead: boolean;
  unpushed: boolean;
}

export function historyEntries(repo: Repository): HistoryEntry[] {
  const commits = logQuery(repo, { all: true });
  const tips: Record<string, string[]> = {};
  for (const [name, id] of Object.entries(repo.branches)) {
    (tips[id] ??= []).push(name);
  }
  for (const [name, id] of Object.entries(repo.remoteTracking)) {
    (tips[id] ??= []).push(name);
  }
  const remoteTips = Object.values(repo.remoteTracking).filter(
    (id) => id !== "",
  );
  const tracksRemote = remoteTips.length > 0;
  const remoteAncestors = new Set<string>();
  for (const tip of remoteTips) {
    for (const id of ancestorsOf(repo, tip)) remoteAncestors.add(id);
  }
  const headId = headCommit(repo).id;
  return commits.map((commit) => ({
    id: commit.id,
    shortId: commit.id.slice(0, 7),
    message: commit.message,
    tips: tips[commit.id] ?? [],
    isHead: commit.id === headId,
    unpushed: tracksRemote && !remoteAncestors.has(commit.id),
  }));
}
