import { shaOf } from "./hash";
import { buildInitialHouse, cloneHouse } from "./house";
import { GitError } from "./types";
import type { Commit, House, Repository } from "./types";

export const DEFAULT_AUTHOR = "GittyPunk Player <player@gittypunk.local>";
export const MAIN_BRANCH = "main";
export const ORIGIN_URL = "https://gittypunk.local/house.git";

export function authorOf(repo: Repository): string {
  return repo.config["user.name"] ?? DEFAULT_AUTHOR;
}

export function cloneRepo(repo: Repository): Repository {
  return {
    commits: { ...repo.commits },
    branches: { ...repo.branches },
    head: repo.head,
    working: structuredClone(repo.working),
    index: structuredClone(repo.index),
    origin: {
      commits: { ...repo.origin.commits },
      branches: { ...repo.origin.branches },
    },
    remoteTracking: { ...repo.remoteTracking },
    remotes: { ...repo.remotes },
    config: { ...repo.config },
    merge: repo.merge ? structuredClone(repo.merge) : null,
    rebase: repo.rebase ? structuredClone(repo.rebase) : null,
    clock: repo.clock,
  };
}

export function createInitialRepository(): Repository {
  const tree = buildInitialHouse();
  const repo: Repository = {
    commits: {},
    branches: {},
    head: { kind: "branch", branch: MAIN_BRANCH },
    working: {},
    index: {},
    origin: { commits: {}, branches: {} },
    remoteTracking: {},
    remotes: { origin: ORIGIN_URL },
    config: {},
    merge: null,
    rebase: null,
    clock: 1,
  };
  const first = addCommit(repo, tree, "Initial house", []);
  repo.branches[MAIN_BRANCH] = first.id;
  repo.working = cloneHouse(tree);
  repo.index = cloneHouse(tree);
  return repo;
}

export function addCommit(
  repo: Repository,
  tree: House,
  message: string,
  parents: string[],
  author = authorOf(repo),
): Commit {
  const body = {
    message,
    parents,
    tree,
    author,
    timestamp: repo.clock,
  };
  let id = shaOf(body);
  let nonce = 0;
  while (repo.commits[id]) {
    nonce += 1;
    id = shaOf({ ...body, nonce });
  }
  const commit: Commit = {
    id,
    message,
    parents,
    tree: structuredClone(tree),
    author,
    timestamp: repo.clock,
  };
  repo.clock += 1;
  repo.commits[id] = commit;
  return commit;
}

export function currentBranch(repo: Repository): string | null {
  return repo.head.kind === "branch" ? repo.head.branch : null;
}

export function headCommit(repo: Repository): Commit {
  const id =
    repo.head.kind === "branch" ? repo.branches[repo.head.branch] : repo.head.commit;
  const commit = id ? repo.commits[id] : undefined;
  if (!commit) throw new GitError("fatal: HEAD points to a missing commit");
  return commit;
}

export function commitTree(repo: Repository, commitId: string): House {
  const commit = repo.commits[commitId];
  if (!commit) throw new GitError(`fatal: bad object ${commitId}`);
  return commit.tree;
}

export function ancestorsOf(repo: Repository, commitId: string): Set<string> {
  const seen = new Set<string>();
  const stack = [commitId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    const commit = repo.commits[current];
    if (commit) stack.push(...commit.parents);
  }
  return seen;
}

export function isAncestor(
  repo: Repository,
  ancestorId: string,
  descendantId: string,
): boolean {
  if (ancestorId === descendantId) return true;
  return ancestorsOf(repo, descendantId).has(ancestorId);
}

export function mergeBase(
  repo: Repository,
  aId: string,
  bId: string,
): string | null {
  const oursAncestors = ancestorsOf(repo, aId);
  const seen = new Set<string>();
  const queue = [bId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (oursAncestors.has(current)) return current;
    const commit = repo.commits[current];
    if (commit) queue.push(...commit.parents);
  }
  return null;
}

export function linearCommitsBetween(
  repo: Repository,
  baseId: string,
  headId: string,
): Commit[] {
  const excluded = ancestorsOf(repo, baseId);
  const included = ancestorsOf(repo, headId);
  const list: Commit[] = [];
  for (const id of included) {
    if (excluded.has(id)) continue;
    const commit = repo.commits[id];
    if (commit && commit.parents.length === 1) list.push(commit);
  }
  return list.sort((a, b) => a.timestamp - b.timestamp);
}

function resolveBaseName(repo: Repository, base: string): string {
  if (base === "HEAD" || base === "@") return headCommit(repo).id;
  const branchId = repo.branches[base];
  if (branchId) return branchId;
  if (base.startsWith("origin/")) {
    const tracked = repo.remoteTracking[base];
    if (tracked) return tracked;
  }
  const exact = repo.commits[base];
  if (exact) return base;
  if (base.length >= 4) {
    const matches = Object.keys(repo.commits).filter((id) =>
      id.startsWith(base),
    );
    if (matches.length === 1) return matches[0] as string;
    if (matches.length > 1) {
      throw new GitError(`error: short object ID ${base} is ambiguous`);
    }
  }
  throw new GitError(
    `fatal: ambiguous argument '${base}': unknown revision or path not in the working tree.`,
  );
}

export function resolveRevision(repo: Repository, revision: string): string {
  const trimmed = revision.trim();
  if (!trimmed) throw new GitError("fatal: empty revision");
  const firstModifier = trimmed.search(/[~^]/);
  const base = firstModifier === -1 ? trimmed : trimmed.slice(0, firstModifier);
  const steps = firstModifier === -1 ? "" : trimmed.slice(firstModifier);
  let commitId = resolveBaseName(repo, base);
  const stepPattern = /([~^])(\d*)/g;
  let match: RegExpExecArray | null;
  while ((match = stepPattern.exec(steps)) !== null) {
    const count = match[2] === "" ? 1 : Number.parseInt(match[2] as string, 10);
    if (match[1] === "~") {
      for (let step = 0; step < count; step += 1) {
        const commit = repo.commits[commitId];
        if (!commit || commit.parents.length === 0) {
          throw new GitError(`fatal: bad revision '${revision}'`);
        }
        commitId = commit.parents[0] as string;
      }
    } else {
      const commit = repo.commits[commitId];
      if (!commit) throw new GitError(`fatal: bad revision '${revision}'`);
      if (count > 0) {
        if (count > commit.parents.length) {
          throw new GitError(`fatal: bad revision '${revision}'`);
        }
        commitId = commit.parents[count - 1] as string;
      }
    }
  }
  return commitId;
}

export function moveHead(repo: Repository, commitId: string): void {
  if (repo.head.kind === "branch") {
    repo.branches[repo.head.branch] = commitId;
  } else {
    repo.head = { kind: "detached", commit: commitId };
  }
}
