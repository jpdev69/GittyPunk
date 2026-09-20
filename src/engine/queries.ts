import { pathsUnderPrefix } from "./house";
import { ancestorsOf, commitTree, currentBranch, headCommit, resolveRevision } from "./repo";
import { diffTrees, housePaths } from "./trees";
import { GitError } from "./types";
import type {
  ArtifactKind,
  Commit,
  DiffEntry,
  House,
  RepoStatus,
  Repository,
  StatusEntry,
  StagedChange,
} from "./types";

export interface TreeEntryInfo {
  path: string;
  kind: ArtifactKind;
}

export function treeOf(repo: Repository, ref: string): House {
  if (ref === "index") return repo.index;
  if (ref === "working") return repo.working;
  return commitTree(repo, resolveRevision(repo, ref));
}

export function diffRefs(repo: Repository, fromRef: string, toRef: string): DiffEntry[] {
  return diffTrees(treeOf(repo, fromRef), treeOf(repo, toRef));
}

export function getStatus(repo: Repository): RepoStatus {
  const branch = currentBranch(repo);
  const headTree = headCommit(repo).tree;
  const stagedDiff = diffTrees(headTree, repo.index);
  const workDiff = diffTrees(repo.index, repo.working);
  const conflictedPaths = new Set<string>();
  for (const conflict of repo.merge?.conflicts ?? []) conflictedPaths.add(conflict.path);
  for (const conflict of repo.rebase?.conflicts ?? []) conflictedPaths.add(conflict.path);
  const paths = [
    ...new Set([
      ...stagedDiff.map((entry) => entry.path),
      ...workDiff.map((entry) => entry.path),
      ...conflictedPaths,
    ]),
  ];
  const entries: StatusEntry[] = [];
  for (const path of [...paths].sort()) {
    const stagedEntry = stagedDiff.find((entry) => entry.path === path);
    const workEntry = workDiff.find((entry) => entry.path === path);
    const staged: StagedChange = stagedEntry
      ? stagedEntry.after
        ? stagedEntry.before
          ? "modified"
          : "added"
        : "removed"
      : null;
    let worktree: StatusEntry["worktree"] = null;
    if (workEntry) {
      worktree = workEntry.after ? (workEntry.before ? "modified" : "untracked") : "removed";
    }
    if (conflictedPaths.has(path)) worktree = "conflict";
    entries.push({ path, staged, worktree });
  }
  let ahead = 0;
  let behind = 0;
  if (branch) {
    const remoteId = repo.remoteTracking[`origin/${branch}`];
    const localId = repo.branches[branch];
    if (remoteId && localId) {
      const localAncestors = ancestorsOf(repo, localId);
      const remoteAncestors = ancestorsOf(repo, remoteId);
      for (const id of localAncestors) {
        if (!remoteAncestors.has(id)) ahead += 1;
      }
      for (const id of remoteAncestors) {
        if (!localAncestors.has(id)) behind += 1;
      }
    }
  }
  return {
    detached: repo.head.kind === "detached",
    branch,
    clean: entries.length === 0,
    entries,
    ahead,
    behind,
    merging: repo.merge !== null,
    rebasing: repo.rebase !== null,
  };
}

export interface LogQuery {
  revs?: string[];
  exclude?: string[];
  all?: boolean;
  path?: string;
}

function commitTouchesPath(repo: Repository, commit: Commit, path: string): boolean {
  const parentTree = commit.parents.length > 0
    ? repo.commits[commit.parents[0] as string]?.tree ?? {}
    : {};
  return diffTrees(parentTree, commit.tree).some(
    (entry) => entry.path === path || entry.path.startsWith(`${path}/`),
  );
}

export function logQuery(repo: Repository, query: LogQuery = {}): Commit[] {
  const starts: string[] = [];
  if (query.all) {
    starts.push(...Object.values(repo.branches));
    starts.push(...Object.values(repo.remoteTracking));
  } else if (query.revs && query.revs.length > 0) {
    for (const rev of query.revs) starts.push(resolveRevision(repo, rev));
  } else {
    starts.push(headCommit(repo).id);
  }
  const excluded = new Set<string>();
  for (const rev of query.exclude ?? []) {
    for (const id of ancestorsOf(repo, resolveRevision(repo, rev))) excluded.add(id);
  }
  const seen = new Set<string>();
  const results: Commit[] = [];
  for (const start of starts) {
    for (const id of ancestorsOf(repo, start)) {
      if (excluded.has(id) || seen.has(id)) continue;
      const commit = repo.commits[id];
      if (!commit) continue;
      if (query.path && !commitTouchesPath(repo, commit, query.path)) continue;
      seen.add(id);
      results.push(commit);
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

export function lsFiles(repo: Repository): string[] {
  return housePaths(repo.index);
}

export function lsTree(repo: Repository, revision: string, path?: string): TreeEntryInfo[] {
  const tree = commitTree(repo, resolveRevision(repo, revision));
  const paths = path ? pathsUnderPrefix(tree, path) : housePaths(tree);
  return paths.map((entry) => ({ path: entry, kind: tree[entry].kind }));
}

export function showCommit(
  repo: Repository,
  revision: string,
): { commit: Commit; stat: DiffEntry[] } {
  const commit = repo.commits[resolveRevision(repo, revision)];
  if (!commit) {
    throw new GitError(`fatal: bad revision '${revision}'`);
  }
  const parentTree = commit.parents.length > 0
    ? repo.commits[commit.parents[0] as string]?.tree ?? {}
    : {};
  return { commit, stat: diffTrees(parentTree, commit.tree) };
}
