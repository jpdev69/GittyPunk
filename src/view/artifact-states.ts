import { getStatus, headCommit } from "../engine";
import type { Conflict, Repository, StagedChange } from "../engine";

export interface ArtifactVisualState {
  path: string;
  staged: StagedChange;
  unstaged: "modified" | "untracked" | null;
  conflict: Conflict | null;
}

export type VisualStateMap = Record<string, ArtifactVisualState>;

export function computeVisualStates(repo: Repository): VisualStateMap {
  const status = getStatus(repo);
  const conflicts = new Map<string, Conflict>();
  for (const conflict of repo.merge?.conflicts ?? repo.rebase?.conflicts ?? []) {
    conflicts.set(conflict.path, conflict);
  }
  const map: VisualStateMap = {};
  for (const entry of status.entries) {
    map[entry.path] = {
      path: entry.path,
      staged: entry.staged,
      unstaged:
        entry.worktree === "modified" || entry.worktree === "untracked"
          ? entry.worktree
          : null,
      conflict: conflicts.get(entry.path) ?? null,
    };
  }
  return map;
}

export interface HouseSummary {
  branch: string | null;
  detached: boolean;
  head: string;
  ahead: number;
  behind: number;
  modified: number;
  staged: number;
  removals: number;
  untracked: number;
  conflicts: number;
  merging: boolean;
  rebasing: boolean;
  clean: boolean;
  unfetched: boolean;
}

export function summarizeHouseState(repo: Repository): HouseSummary {
  const status = getStatus(repo);
  let modified = 0;
  let staged = 0;
  let removals = 0;
  let untracked = 0;
  for (const entry of status.entries) {
    if (entry.worktree === "modified") modified += 1;
    if (entry.worktree === "untracked") untracked += 1;
    if (entry.staged === "added" || entry.staged === "modified") staged += 1;
    if (entry.staged === "removed") removals += 1;
  }
  const conflicts =
    repo.merge?.conflicts.length ?? repo.rebase?.conflicts.length ?? 0;
  const branchName = status.branch ?? "main";
  const originTip = repo.origin.branches[branchName];
  const trackingTip = repo.remoteTracking[`origin/${branchName}`];
  const unfetched = originTip !== undefined && originTip !== trackingTip;

  return {
    branch: status.branch,
    detached: status.detached,
    head: headCommit(repo).id.slice(0, 7),
    ahead: status.ahead,
    behind: status.behind,
    modified,
    staged,
    removals,
    untracked,
    conflicts,
    merging: status.merging,
    rebasing: status.rebasing,
    clean: status.clean && conflicts === 0,
    unfetched,
  };
}

export interface StatusPart {
  kind:
    | "modified"
    | "staged"
    | "removal"
    | "untracked"
    | "conflict"
    | "clean";
  text: string;
}

export function houseStatusParts(summary: HouseSummary): StatusPart[] {
  const parts: StatusPart[] = [];
  if (summary.modified > 0) {
    parts.push({ kind: "modified", text: `${summary.modified} modified` });
  }
  if (summary.staged > 0) {
    parts.push({ kind: "staged", text: `${summary.staged} staged` });
  }
  if (summary.removals > 0) {
    parts.push({
      kind: "removal",
      text: `${summary.removals} staged for removal`,
    });
  }
  if (summary.untracked > 0) {
    parts.push({ kind: "untracked", text: `${summary.untracked} untracked` });
  }
  if (summary.conflicts > 0) {
    parts.push({ kind: "conflict", text: `${summary.conflicts} in conflict` });
  }
  if (parts.length === 0) {
    parts.push({ kind: "clean", text: "working tree clean" });
  }
  return parts;
}
