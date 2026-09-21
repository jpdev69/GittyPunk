import { cloneRepo, addCommit, headCommit, commitTree, resolveRevision, isAncestor, mergeBase, moveHead } from "./repo";
import { diffTrees, mergePath, houseTreesEqual } from "./trees";
import { GitError } from "./types";
import type { Commit, Conflict, House, Repository } from "./types";

export interface CommitOptions {
  message?: string;
  amend?: boolean;
  allowEmpty?: boolean;
}

export interface CommitResult {
  repo: Repository;
  commit: Commit;
}

function completeMerge(repo: Repository, options: CommitOptions): CommitResult {
  const next = cloneRepo(repo);
  const state = next.merge;
  if (!state) throw new GitError("fatal: no merge in progress");
  if (state.conflicts.length > 0) {
    throw new GitError("error: Committing is not possible because you have unmerged artifacts. Resolve them, then stage with git add.");
  }
  const parents = [state.oursHead, state.theirsHead];
  const message = options.message ?? state.defaultMessage;
  const created = addCommit(next, next.index, message, parents);
  moveHead(next, created.id);
  next.merge = null;
  return { repo: next, commit: created };
}

export function commit(repo: Repository, options: CommitOptions = {}): CommitResult {
  if (repo.rebase) {
    throw new GitError("fatal: cannot commit during a rebase (finish it with rebase --continue or --abort)");
  }
  if (repo.merge) return completeMerge(repo, options);
  const next = cloneRepo(repo);
  const head = headCommit(next);
  const amending = options.amend === true;
  const treeChanged = !houseTreesEqual(head.tree, next.index);
  const messageChanged =
    amending && options.message !== undefined && options.message !== head.message;
  if (!treeChanged) {
    if (!amending) {
      if (!houseTreesEqual(next.index, next.working)) {
        throw new GitError("no changes added to commit (stage artifacts with git add first)");
      }
      throw new GitError("nothing to commit, working tree clean");
    }
    if (!messageChanged && !options.allowEmpty) {
      throw new GitError("You asked to amend the most recent commit, but doing so would make it empty.");
    }
  }
  let message: string;
  if (amending) {
    message = options.message ?? head.message;
  } else {
    if (options.message === undefined) {
      throw new GitError(
        'fatal: no commit message given (use -m "<message>")\nusage: git commit -m "<message>"\n\nExamples:\n  git commit -m "Recolor sofa"\n  git commit --amend --no-edit',
      );
    }
    message = options.message;
  }
  if (!message.trim()) {
    throw new GitError("aborting commit due to empty commit message");
  }
  const parents = amending ? [...head.parents] : [head.id];
  const created = addCommit(next, next.index, message, parents);
  moveHead(next, created.id);
  return { repo: next, commit: created };
}

export type ResetMode = "soft" | "mixed" | "hard";

export interface ResetOptions {
  mode: ResetMode;
  revision?: string;
}

export function reset(repo: Repository, options: ResetOptions): Repository {
  if (repo.rebase) {
    throw new GitError("fatal: cannot reset during a rebase (use rebase --abort first)");
  }
  const next = cloneRepo(repo);
  const target = resolveRevision(next, options.revision ?? "HEAD");
  if (next.merge) next.merge = null;
  moveHead(next, target);
  if (options.mode !== "soft") {
    const tree = commitTree(next, target);
    next.index = structuredClone(tree);
    if (options.mode === "hard") {
      next.working = structuredClone(tree);
    }
  }
  return next;
}

export function createBranch(repo: Repository, name: string, startRevision?: string): Repository {
  const next = cloneRepo(repo);
  if (!name.trim() || name.startsWith("-") || name.startsWith("/") || name.includes("..") || name.endsWith("/")) {
    throw new GitError(`fatal: '${name}' is not a valid branch name`);
  }
  if (next.branches[name]) {
    throw new GitError(`fatal: a branch named '${name}' already exists`);
  }
  next.branches[name] = resolveRevision(next, startRevision ?? "HEAD");
  return next;
}

export function deleteBranch(repo: Repository, name: string): Repository {
  const next = cloneRepo(repo);
  if (!next.branches[name]) {
    throw new GitError(`error: branch '${name}' not found`);
  }
  if (next.head.kind === "branch" && next.head.branch === name) {
    throw new GitError(`error: cannot delete branch '${name}' checked out at HEAD`);
  }
  delete next.branches[name];
  return next;
}

export function checkout(repo: Repository, target: string): Repository {
  if (repo.merge || repo.rebase) {
    throw new GitError("error: you need to resolve your current merge or rebase before switching (use merge --abort or rebase --abort)");
  }
  const next = cloneRepo(repo);
  const currentHead = headCommit(next);
  const branchId = next.branches[target];
  let resolved: string;
  try {
    resolved = branchId ?? resolveRevision(next, target);
  } catch {
    throw new GitError(`error: pathspec '${target}' did not match any file(s) known to git`);
  }
  const targetTree = commitTree(next, resolved);
  const workingDirty = diffTrees(currentHead.tree, next.working).map((entry) => entry.path);
  const indexDirty = diffTrees(currentHead.tree, next.index).map((entry) => entry.path);
  const targetChanged = new Set(diffTrees(currentHead.tree, targetTree).map((entry) => entry.path));
  const blocking = [...new Set([...workingDirty, ...indexDirty])].filter((path) => targetChanged.has(path));
  if (blocking.length > 0) {
    throw new GitError(`error: Your local changes to the following paths would be overwritten by checkout:\n\t${blocking.join("\n\t")}\nPlease commit your changes before you switch branches.`);
  }
  const untrackedBlocking = Object.keys(next.working)
    .filter((path) => !next.index[path] && !currentHead.tree[path] && targetTree[path])
    .sort();
  if (untrackedBlocking.length > 0) {
    throw new GitError(`error: The following untracked working tree files would be overwritten by checkout:\n\t${untrackedBlocking.join("\n\t")}`);
  }
  const nextWorking = structuredClone(targetTree);
  const nextIndex = structuredClone(targetTree);
  for (const path of new Set([...workingDirty, ...indexDirty])) {
    const workingArtifact = next.working[path];
    if (workingArtifact) nextWorking[path] = structuredClone(workingArtifact);
    else delete nextWorking[path];
    const indexArtifact = next.index[path];
    if (indexArtifact) nextIndex[path] = structuredClone(indexArtifact);
    else delete nextIndex[path];
  }
  next.working = nextWorking;
  next.index = nextIndex;
  next.head = branchId ? { kind: "branch", branch: target } : { kind: "detached", commit: resolved };
  return next;
}

export interface MergeOutcome {
  repo: Repository;
  alreadyUpToDate: boolean;
  fastForward: boolean;
  conflicts: Conflict[];
}

export function merge(repo: Repository, target: string): MergeOutcome {
  if (repo.merge || repo.rebase) {
    throw new GitError("fatal: you have not concluded your current merge or rebase");
  }
  if (!houseTreesEqual(repo.index, repo.working)) {
    throw new GitError("error: your local changes would be overwritten by merge. Please commit or reset before merging.");
  }
  if (!houseTreesEqual(headCommit(repo).tree, repo.index)) {
    throw new GitError("error: your staged changes would be overwritten by merge. Please commit or reset before merging.");
  }
  const next = cloneRepo(repo);
  const theirsId = resolveRevision(next, target);
  const theirsName = next.branches[target] ? target : theirsId;
  const oursId = headCommit(next).id;
  if (theirsId === oursId || isAncestor(next, theirsId, oursId)) {
    return { repo: next, alreadyUpToDate: true, fastForward: false, conflicts: [] };
  }
  if (isAncestor(next, oursId, theirsId)) {
    const tree = commitTree(next, theirsId);
    moveHead(next, theirsId);
    next.working = structuredClone(tree);
    next.index = structuredClone(tree);
    return { repo: next, alreadyUpToDate: false, fastForward: true, conflicts: [] };
  }
  const baseId = mergeBase(next, oursId, theirsId);
  if (!baseId) {
    throw new GitError("fatal: refusing to merge unrelated histories");
  }
  const baseTree = commitTree(next, baseId);
  const oursTree = commitTree(next, oursId);
  const theirsTree = commitTree(next, theirsId);
  const mergedTree: House = {};
  const conflicts: Conflict[] = [];
  const paths = [
    ...new Set([...Object.keys(baseTree), ...Object.keys(oursTree), ...Object.keys(theirsTree)]),
  ].sort();
  for (const path of paths) {
    const base = baseTree[path] ?? null;
    const ours = oursTree[path] ?? null;
    const theirs = theirsTree[path] ?? null;
    const outcome = mergePath(base, ours, theirs);
    if (outcome.conflictKind) {
      conflicts.push({ path, kind: outcome.conflictKind, ours, theirs, base });
      if (ours) mergedTree[path] = ours;
    } else if (outcome.result) {
      mergedTree[path] = outcome.result;
    }
  }
  if (conflicts.length === 0) {
    const created = addCommit(next, mergedTree, `Merge branch '${theirsName}'`, [oursId, theirsId]);
    moveHead(next, created.id);
    next.working = structuredClone(mergedTree);
    next.index = structuredClone(mergedTree);
    return { repo: next, alreadyUpToDate: false, fastForward: false, conflicts: [] };
  }
  next.merge = {
    kind: "merge",
    branch: theirsName,
    oursHead: oursId,
    theirsHead: theirsId,
    defaultMessage: `Merge branch '${theirsName}'`,
    conflicts,
    headBeforeMerge: next.head,
    workingBeforeMerge: structuredClone(next.working),
    indexBeforeMerge: structuredClone(next.index),
  };
  next.working = structuredClone(mergedTree);
  next.index = structuredClone(mergedTree);
  return { repo: next, alreadyUpToDate: false, fastForward: false, conflicts };
}

export type ConflictChoice = "ours" | "theirs";

export function resolveConflict(repo: Repository, path: string, choice: ConflictChoice): Repository {
  const next = cloneRepo(repo);
  const state = next.merge ?? next.rebase;
  if (!state) {
    throw new GitError("fatal: no merge or rebase in progress");
  }
  const conflict = state.conflicts.find((candidate) => candidate.path === path);
  if (!conflict) {
    throw new GitError(`error: '${path}' has no conflict to resolve`);
  }
  const chosen = choice === "ours" ? conflict.ours : conflict.theirs;
  if (chosen) {
    next.working[path] = structuredClone(chosen);
    next.index[path] = structuredClone(chosen);
  } else {
    delete next.working[path];
    delete next.index[path];
  }
  state.conflicts = state.conflicts.filter((candidate) => candidate.path !== path);
  return next;
}

export function abortMerge(repo: Repository): Repository {
  if (!repo.merge) {
    throw new GitError("fatal: There is no merge to abort (MERGE_HEAD missing)");
  }
  const next = cloneRepo(repo);
  const state = next.merge;
  if (!state) {
    throw new GitError("fatal: There is no merge to abort (MERGE_HEAD missing)");
  }
  next.working = state.workingBeforeMerge;
  next.index = state.indexBeforeMerge;
  next.merge = null;
  return next;
}
