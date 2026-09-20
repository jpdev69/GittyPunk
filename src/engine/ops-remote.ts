import { cloneRepo, ancestorsOf, currentBranch, isAncestor, MAIN_BRANCH } from "./repo";
import { cloneHouse } from "./house";
import { merge } from "./ops-history";
import { rebase } from "./ops-rewrite";
import { GitError } from "./types";
import type { Repository, RemoteHouse, BundleData, Commit } from "./types";
import type { MergeOutcome } from "./ops-history";
import type { RebaseOutcome } from "./ops-rewrite";

export interface FetchResult {
  repo: Repository;
  updatedBranches: string[];
}

export function fetch(repo: Repository, remoteName = "origin"): FetchResult {
  if (!repo.remotes[remoteName]) {
    throw new GitError(`fatal: '${remoteName}' does not appear to be a repository`);
  }
  if (remoteName !== "origin") {
    throw new GitError("fatal: GittyPunk simulates only the 'origin' remote house");
  }
  const next = cloneRepo(repo);
  const updated: string[] = [];
  for (const [branch, commitId] of Object.entries(next.origin.branches)) {
    if (next.remoteTracking[`origin/${branch}`] !== commitId) updated.push(branch);
    next.remoteTracking[`origin/${branch}`] = commitId;
  }
  for (const commit of Object.values(next.origin.commits)) {
    next.commits[commit.id] = commit;
  }
  return { repo: next, updatedBranches: updated };
}

export function addRemote(repo: Repository, name: string, url: string): Repository {
  const next = cloneRepo(repo);
  if (!name.trim() || !url.trim()) {
    throw new GitError("fatal: remote name and url cannot be empty");
  }
  if (next.remotes[name]) {
    throw new GitError(`error: remote ${name} already exists.`);
  }
  next.remotes[name] = url;
  return next;
}

export function applyOriginUpdate(repo: Repository, origin: RemoteHouse): Repository {
  const next = cloneRepo(repo);
  next.origin = {
    commits: { ...origin.commits },
    branches: { ...origin.branches },
  };
  return next;
}

export function setConfig(repo: Repository, key: string, value: string): Repository {
  const next = cloneRepo(repo);
  next.config[key] = value;
  return next;
}

export type PullResult = MergeOutcome | RebaseOutcome;

export function pull(repo: Repository, remoteName = "origin"): PullResult {
  const branch = currentBranch(repo);
  if (!branch) {
    throw new GitError("fatal: you are not on a branch; cannot pull");
  }
  const fetched = fetch(repo, remoteName);
  const trackingRef = `origin/${branch}`;
  if (!fetched.repo.remoteTracking[trackingRef]) {
    throw new GitError(`fatal: no upstream branch for '${branch}' on origin (push first)`);
  }
  if (fetched.repo.config["pull.rebase"] === "true") {
    return rebase(fetched.repo, { onto: trackingRef });
  }
  return merge(fetched.repo, trackingRef);
}

export interface PushOptions {
  remote?: string;
  branch?: string;
  forceWithLease?: boolean;
}

export interface PushResult {
  repo: Repository;
  branch: string;
  updated: boolean;
}

export function push(repo: Repository, options: PushOptions = {}): PushResult {
  const branch = currentBranch(repo);
  if (!branch) {
    throw new GitError("fatal: you are not currently on a branch; unable to push");
  }
  const remoteName = options.remote ?? "origin";
  if (!repo.remotes[remoteName]) {
    throw new GitError(`fatal: '${remoteName}' does not appear to be a repository`);
  }
  if (remoteName !== "origin") {
    throw new GitError("fatal: GittyPunk simulates only the 'origin' remote house");
  }
  const targetBranch = options.branch ?? branch;
  const localId = repo.branches[branch];
  if (!localId) {
    throw new GitError("fatal: current branch has no commits");
  }
  const remoteId = repo.origin.branches[targetBranch];
  const knownId = repo.remoteTracking[`origin/${targetBranch}`];
  if (remoteId === localId) {
    return { repo: cloneRepo(repo), branch: targetBranch, updated: false };
  }
  if (remoteId !== undefined && !isAncestor(repo, remoteId, localId)) {
    if (options.forceWithLease) {
      if (knownId !== remoteId) {
        throw new GitError(` ! [rejected]        ${targetBranch} -> ${targetBranch} (stale info)\nerror: failed to push some refs\nhint: the remote house changed since your last fetch. Fetch first, then force-with-lease.`);
      }
    } else {
      throw new GitError(` ! [rejected]        ${targetBranch} -> ${targetBranch} (non-fast-forward)\nerror: failed to push some refs\nhint: Updates were rejected because the tip of your current branch is behind its remote counterpart.`);
    }
  }
  const next = cloneRepo(repo);
  next.origin.branches[targetBranch] = localId;
  for (const commitId of ancestorsOf(next, localId)) {
    const commit = next.commits[commitId];
    if (commit && !next.origin.commits[commitId]) {
      next.origin.commits[commitId] = commit;
    }
  }
  next.remoteTracking[`origin/${targetBranch}`] = localId;
  return { repo: next, branch: targetBranch, updated: true };
}

export function bundleCreate(repo: Repository): BundleData {
  const roots: string[] = [...Object.values(repo.branches)];
  if (repo.head.kind === "detached") roots.push(repo.head.commit);
  const commits: Record<string, Commit> = {};
  for (const root of roots) {
    for (const commitId of ancestorsOf(repo, root)) {
      const commit = repo.commits[commitId];
      if (commit) commits[commitId] = commit;
    }
  }
  return {
    format: "gittypunk-bundle",
    version: 1,
    commits,
    branches: { ...repo.branches },
  };
}

export function cloneFromBundle(bundle: BundleData): Repository {
  if (bundle.format !== "gittypunk-bundle" || bundle.version !== 1) {
    throw new GitError("fatal: unrecognized bundle format");
  }
  const commits = { ...bundle.commits };
  const branchNames = Object.keys(bundle.branches);
  if (branchNames.length === 0) {
    throw new GitError("fatal: bundle contains no branches");
  }
  const headBranch = bundle.branches[MAIN_BRANCH] ? MAIN_BRANCH : branchNames[0] as string;
  const headId = bundle.branches[headBranch] as string;
  const headCommitEntry = commits[headId];
  if (!headCommitEntry) {
    throw new GitError("fatal: bundle HEAD is missing from the bundle");
  }
  let clock = 1;
  for (const commit of Object.values(commits)) {
    clock = Math.max(clock, commit.timestamp + 1);
  }
  const repo: Repository = {
    commits,
    branches: { ...bundle.branches },
    head: { kind: "branch", branch: headBranch },
    working: cloneHouse(headCommitEntry.tree),
    index: cloneHouse(headCommitEntry.tree),
    origin: { commits: { ...commits }, branches: { ...bundle.branches } },
    remoteTracking: {},
    remotes: { origin: "house.bundle" },
    config: {},
    merge: null,
    rebase: null,
    clock,
  };
  for (const [branch, commitId] of Object.entries(repo.branches)) {
    repo.remoteTracking[`origin/${branch}`] = commitId;
  }
  return repo;
}
