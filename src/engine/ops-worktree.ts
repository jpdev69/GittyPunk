import { pathsUnderPrefix } from "./house";
import { cloneRepo, headCommit } from "./repo";
import { housePaths } from "./trees";
import { GitError } from "./types";
import type { Artifact, Repository } from "./types";

export interface RemoveOptions {
  cached: boolean;
}

export function upsertArtifact(
  repo: Repository,
  artifact: Artifact,
): Repository {
  const next = cloneRepo(repo);
  next.working[artifact.id] = structuredClone(artifact);
  return next;
}

export function removeWorkingArtifact(repo: Repository, path: string): Repository {
  const next = cloneRepo(repo);
  const paths = pathsUnderPrefix(next.working, path);
  if (paths.length === 0) {
    throw new GitError(`fatal: pathspec '${path}' did not match any files`);
  }
  for (const target of paths) delete next.working[target];
  return next;
}

export function restoreWorking(repo: Repository, path: string): Repository {
  const next = cloneRepo(repo);
  const paths = pathsUnderPrefix(next.index, path);
  if (paths.length === 0) {
    const headTree = headCommit(next).tree;
    if (headTree[path] || pathsUnderPrefix(headTree, path).length > 0) {
      throw new GitError(
        `error: pathspec '${path}' did not match any file known to git\nhint: '${path}' is staged for deletion. Use 'git restore --staged ${path}' or 'git restore -s HEAD ${path}'.`,
      );
    }
    for (const commitObj of Object.values(next.commits)) {
      if (
        commitObj.tree[path] ||
        pathsUnderPrefix(commitObj.tree, path).length > 0
      ) {
        throw new GitError(
          `error: pathspec '${path}' did not match any file known to git\nhint: '${path}' was deleted in past history. Use 'git restore -s ${commitObj.id.slice(0, 7)} ${path}' or 'git restore -s HEAD~1 ${path}'.`,
        );
      }
    }
    throw new GitError(
      `error: pathspec '${path}' did not match any file known to git`,
    );
  }
  for (const target of paths) {
    next.working[target] = structuredClone(next.index[target]);
  }
  return next;
}

function clearResolvedConflicts(repo: Repository, paths: string[]): void {
  if (repo.merge) {
    repo.merge.conflicts = repo.merge.conflicts.filter(
      (conflict) => !paths.includes(conflict.path),
    );
  }
  if (repo.rebase) {
    repo.rebase.conflicts = repo.rebase.conflicts.filter(
      (conflict) => !paths.includes(conflict.path),
    );
  }
}

export function stage(repo: Repository, path: string): Repository {
  const next = cloneRepo(repo);
  const workingPaths = pathsUnderPrefix(next.working, path);
  const indexPaths = pathsUnderPrefix(next.index, path);
  const allPaths = [...new Set([...workingPaths, ...indexPaths])];
  if (allPaths.length === 0) {
    throw new GitError(`fatal: pathspec '${path}' did not match any files`);
  }
  for (const target of allPaths) {
    const artifact = next.working[target];
    if (artifact) next.index[target] = structuredClone(artifact);
    else delete next.index[target];
  }
  clearResolvedConflicts(next, allPaths);
  return next;
}

export function stageAll(repo: Repository): Repository {
  const next = cloneRepo(repo);
  const allPaths = [
    ...new Set([...housePaths(next.working), ...housePaths(next.index)]),
  ];
  for (const target of allPaths) {
    const artifact = next.working[target];
    if (artifact) next.index[target] = structuredClone(artifact);
    else delete next.index[target];
  }
  clearResolvedConflicts(next, allPaths);
  return next;
}

export function unstage(repo: Repository, path: string): Repository {
  const next = cloneRepo(repo);
  const headTree = headCommit(next).tree;
  const indexPaths = pathsUnderPrefix(next.index, path);
  const headPaths = pathsUnderPrefix(headTree, path);
  const allPaths = [...new Set([...indexPaths, ...headPaths])];
  if (allPaths.length === 0) {
    throw new GitError(`fatal: pathspec '${path}' did not match any files`);
  }
  for (const target of allPaths) {
    const artifact = headTree[target];
    if (artifact) next.index[target] = structuredClone(artifact);
    else delete next.index[target];
  }
  return next;
}

export function removeTracked(
  repo: Repository,
  path: string,
  options: RemoveOptions,
): Repository {
  const next = cloneRepo(repo);
  const headTree = headCommit(next).tree;
  const trackedPaths = [
    ...new Set([
      ...pathsUnderPrefix(next.index, path),
      ...pathsUnderPrefix(headTree, path),
    ]),
  ];
  if (trackedPaths.length === 0) {
    throw new GitError(`fatal: pathspec '${path}' did not match any files`);
  }
  for (const target of trackedPaths) {
    delete next.index[target];
    if (!options.cached) delete next.working[target];
  }
  return next;
}
