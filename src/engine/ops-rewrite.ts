import { cloneRepo, addCommit, commitTree, currentBranch, headCommit, linearCommitsBetween, mergeBase, moveHead, resolveRevision } from "./repo";
import { checkout } from "./ops-history";
import { diffTrees, mergePath, houseTreesEqual, omitPaths, pathExistsInTree } from "./trees";
import { shaOf } from "./hash";
import { GitError } from "./types";
import type { Commit, Conflict, House, RebaseState, Repository } from "./types";

export interface RebaseOptions {
  onto: string;
  from?: string;
  branch?: string;
  drop?: string[];
}

export interface RebaseOutcome {
  repo: Repository;
  alreadyUpToDate: boolean;
  fastForward: boolean;
  conflicts: Conflict[];
  replayed: number;
}

function replayCommits(next: Repository, state: RebaseState): RebaseOutcome {
  let replayed = 0;
  while (state.queue.length > 0) {
    const original = next.commits[state.queue[0] as string];
    if (!original) {
      throw new GitError(`fatal: rebase queue references missing commit ${state.queue[0]}`);
    }
    const parentTree = original.parents.length > 0
      ? next.commits[original.parents[0] as string]?.tree ?? {}
      : {};
    const currentTree = next.commits[state.newHead]?.tree;
    if (!currentTree) {
      throw new GitError(`fatal: rebase base commit ${state.newHead} is missing`);
    }
    const changed = diffTrees(parentTree, original.tree);
    const conflicts: Conflict[] = [];
    const nextTree: House = structuredClone(currentTree);
    for (const entry of changed) {
      const base = parentTree[entry.path] ?? null;
      const ours = currentTree[entry.path] ?? null;
      const theirs = original.tree[entry.path] ?? null;
      const outcome = mergePath(base, ours, theirs);
      if (outcome.conflictKind) {
        conflicts.push({ path: entry.path, kind: outcome.conflictKind, ours, theirs, base });
        const oursArtifact = currentTree[entry.path];
        if (oursArtifact) nextTree[entry.path] = structuredClone(oursArtifact);
        else delete nextTree[entry.path];
      } else if (outcome.result) {
        nextTree[entry.path] = structuredClone(outcome.result);
      } else {
        delete nextTree[entry.path];
      }
    }
    if (conflicts.length > 0) {
      state.conflicts = conflicts;
      next.working = structuredClone(nextTree);
      next.index = structuredClone(nextTree);
      next.rebase = state;
      return { repo: next, alreadyUpToDate: false, fastForward: false, conflicts, replayed };
    }
    if (!houseTreesEqual(nextTree, currentTree)) {
      const created = addCommit(next, nextTree, original.message, [state.newHead], original.author);
      state.newHead = created.id;
      replayed += 1;
    }
    state.queue.shift();
  }
  const finalTree = commitTree(next, state.newHead);
  if (state.branch) {
    next.branches[state.branch] = state.newHead;
    next.head = { kind: "branch", branch: state.branch };
  } else {
    moveHead(next, state.newHead);
  }
  next.working = structuredClone(finalTree);
  next.index = structuredClone(finalTree);
  next.rebase = null;
  return { repo: next, alreadyUpToDate: false, fastForward: false, conflicts: [], replayed };
}

export function rebase(repo: Repository, options: RebaseOptions): RebaseOutcome {
  if (repo.merge || repo.rebase) {
    throw new GitError("fatal: it seems there is already a merge or rebase in progress");
  }
  let base = cloneRepo(repo);
  if (options.branch && !base.branches[options.branch]) {
    throw new GitError(`fatal: invalid branch '${options.branch}'`);
  }
  if (options.branch && currentBranch(base) !== options.branch) {
    base = checkout(base, options.branch);
  }
  if (!houseTreesEqual(base.index, base.working)) {
    throw new GitError("error: cannot rebase: You have unstaged changes. Please commit or reset them.");
  }
  if (!houseTreesEqual(headCommit(base).tree, base.index)) {
    throw new GitError("error: cannot rebase: Your index contains uncommitted changes. Please commit or reset them.");
  }
  const ontoId = resolveRevision(base, options.onto);
  const headId = options.branch ? base.branches[options.branch] : headCommit(base).id;
  const baseId = options.from
    ? resolveRevision(base, options.from)
    : mergeBase(base, headId, ontoId);
  if (!baseId) {
    throw new GitError("fatal: refusing to rebase without a common ancestor");
  }
  const drop = new Set(options.drop ?? []);
  const queue = linearCommitsBetween(base, baseId, headId)
    .filter((commit) => !drop.has(commit.id) && !drop.has(commit.message))
    .map((commit) => commit.id);
  if (queue.length === 0) {
    if (headId === ontoId) {
      return { repo: base, alreadyUpToDate: true, fastForward: false, conflicts: [], replayed: 0 };
    }
    moveHead(base, ontoId);
    const tree = commitTree(base, ontoId);
    base.working = structuredClone(tree);
    base.index = structuredClone(tree);
    return { repo: base, alreadyUpToDate: false, fastForward: true, conflicts: [], replayed: 0 };
  }
  const state: RebaseState = {
    kind: "rebase",
    onto: ontoId,
    newHead: ontoId,
    queue,
    conflicts: [],
    snapshot: {
      head: base.head,
      working: structuredClone(base.working),
      index: structuredClone(base.index),
    },
    branch: options.branch ?? null,
  };
  base.rebase = state;
  return replayCommits(base, state);
}

export function rebaseContinue(repo: Repository): RebaseOutcome {
  if (!repo.rebase) {
    throw new GitError("fatal: no rebase in progress");
  }
  const next = cloneRepo(repo);
  const state = next.rebase;
  if (!state) {
    throw new GitError("fatal: no rebase in progress");
  }
  if (state.conflicts.length > 0) {
    throw new GitError("error: you must resolve all conflicts before continuing the rebase (resolve, then git add)");
  }
  const original = next.commits[state.queue[0] as string];
  if (!original) {
    throw new GitError("fatal: rebase queue is empty");
  }
  const currentTree = next.commits[state.newHead]?.tree;
  if (!currentTree) {
    throw new GitError(`fatal: rebase base commit ${state.newHead} is missing`);
  }
  if (!houseTreesEqual(next.index, currentTree)) {
    const created = addCommit(next, next.index, original.message, [state.newHead], original.author);
    state.newHead = created.id;
  }
  state.queue.shift();
  return replayCommits(next, state);
}

export function abortRebase(repo: Repository): Repository {
  if (!repo.rebase) {
    throw new GitError("fatal: no rebase in progress to abort");
  }
  const next = cloneRepo(repo);
  const state = next.rebase;
  if (!state) {
    throw new GitError("fatal: no rebase in progress to abort");
  }
  next.working = state.snapshot.working;
  next.index = state.snapshot.index;
  next.head = state.snapshot.head;
  next.rebase = null;
  return next;
}

export interface PurgeResult {
  repo: Repository;
  rewritten: number;
}

export function purgePath(repo: Repository, path: string): PurgeResult {
  if (repo.merge || repo.rebase) {
    throw new GitError("fatal: cannot rewrite history during a merge or rebase");
  }
  const next = cloneRepo(repo);
  const head = headCommit(next);
  if (!houseTreesEqual(head.tree, next.index) || !houseTreesEqual(head.tree, next.working)) {
    throw new GitError("fatal: history rewriting requires a clean working tree");
  }
  const ordered = Object.values(next.commits).sort((a, b) => a.timestamp - b.timestamp);
  const idMap: Record<string, string> = {};
  const rewrittenMap: Record<string, Commit> = {};
  let removedAnywhere = false;
  let rewriteCount = 0;
  for (const commit of ordered) {
    const touched = pathExistsInTree(commit.tree, path);
    if (touched) removedAnywhere = true;
    const parents = commit.parents.map((parentId) => idMap[parentId] ?? parentId);
    const parentsChanged = parents.some((parentId, index) => parentId !== commit.parents[index]);
    if (!touched && !parentsChanged) {
      idMap[commit.id] = commit.id;
      rewrittenMap[commit.id] = commit;
      continue;
    }
    const cleanedTree = omitPaths(commit.tree, path);
    const body = {
      message: commit.message,
      parents,
      tree: cleanedTree,
      author: commit.author,
      timestamp: commit.timestamp,
    };
    let id = shaOf(body);
    let nonce = 0;
    while (rewrittenMap[id]) {
      nonce += 1;
      id = shaOf({ ...body, nonce });
    }
    rewrittenMap[id] = {
      id,
      message: commit.message,
      parents,
      tree: cleanedTree,
      author: commit.author,
      timestamp: commit.timestamp,
    };
    rewriteCount += 1;
    idMap[commit.id] = id;
  }
  if (!removedAnywhere) {
    throw new GitError(`fatal: no history to rewrite for '${path}'`);
  }
  const prunedMap: Record<string, string> = {};
  const finalCommits: Record<string, Commit> = {};
  let prunedCount = 0;
  for (const commit of ordered) {
    const current = rewrittenMap[idMap[commit.id] as string];
    if (!current) continue;
    const resolvedParents = current.parents.map((parentId) => prunedMap[parentId] ?? parentId);
    const firstParent = resolvedParents[0] ?? null;
    const firstParentTree = firstParent ? finalCommits[firstParent]?.tree ?? null : null;
    const prunable =
      firstParentTree !== null &&
      current.parents.length === 1 &&
      houseTreesEqual(current.tree, firstParentTree);
    if (prunable && firstParent) {
      prunedMap[current.id] = firstParent;
      prunedCount += 1;
      continue;
    }
    prunedMap[current.id] = current.id;
    finalCommits[current.id] = { ...current, parents: resolvedParents };
  }
  const roots: string[] = [];
  for (const branch of Object.keys(next.branches)) {
    const rewritten = idMap[next.branches[branch] as string] ?? next.branches[branch];
    const finalId = prunedMap[rewritten] ?? rewritten;
    next.branches[branch] = finalId;
    roots.push(finalId);
  }
  if (next.head.kind === "detached") {
    const rewritten = idMap[next.head.commit] ?? next.head.commit;
    const finalId = prunedMap[rewritten] ?? rewritten;
    next.head = { kind: "detached", commit: finalId };
    roots.push(finalId);
  }
  const kept = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (kept.has(current)) continue;
    kept.add(current);
    const commit = finalCommits[current];
    if (commit) stack.push(...commit.parents);
  }
  next.commits = {};
  for (const id of Object.keys(finalCommits)) {
    if (kept.has(id)) next.commits[id] = finalCommits[id] as Commit;
  }
  const headId = next.head.kind === "branch" ? next.branches[next.head.branch] : next.head.commit;
  const headTree = headId ? next.commits[headId]?.tree ?? {} : {};
  next.working = structuredClone(headTree);
  next.index = structuredClone(headTree);
  next.remoteTracking = {};
  return { repo: next, rewritten: rewriteCount + prunedCount };
}
