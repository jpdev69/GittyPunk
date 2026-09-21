import {
  GitError,
  abortMerge,
  abortRebase,
  checkout,
  cloneRepo,
  commit,
  createBranch,
  currentBranch,
  deleteBranch,
  diffTrees,
  headCommit,
  isAncestor,
  logQuery,
  lsTree,
  merge,
  rebase,
  rebaseContinue,
  reset,
  resolveConflict,
  resolveRevision,
  setConfig,
  showCommit,
  stage,
  treeOf,
} from "../engine";
import type {
  CommitOptions,
  ConflictChoice,
  LogQuery,
  Repository,
  ResetMode,
} from "../engine";
import { parseArgs, unknownFlags } from "./args";
import { expandPathspecs } from "./pathspecs";
import {
  abbreviate,
  commitSummary,
  formatDiff,
  formatDiffStat,
  formatLogFull,
  formatLogOneline,
  formatMergeOutcome,
  formatRebaseOutcome,
} from "./format";
import type { CommandHandler, HandlerResult } from "./types";

const COMMIT_USAGE = "usage: git commit [<options>] [--] [<pathspec>...]";

function stageTrackedChanges(repo: Repository): Repository {
  let next = repo;
  const headTree = headCommit(next).tree;
  for (const entry of diffTrees(headTree, next.working)) {
    if (!headTree[entry.path]) continue;
    next = stage(next, entry.path);
  }
  return next;
}

export const commitCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["m", "message"]));
  unknownFlags(
    parsed,
    [
      "m",
      "message",
      "amend",
      "no-edit",
      "a",
      "all",
      "allow-empty",
      "allow-empty-message",
      "edit",
      "e",
      "no-verify",
      "q",
      "quiet",
      "v",
      "verbose",
    ],
    COMMIT_USAGE,
  );
  const messageFlag = parsed.flags.m ?? parsed.flags.message;
  const message = typeof messageFlag === "string" ? messageFlag : undefined;
  const amend = parsed.flags.amend === true;
  const all = parsed.flags.a === true || parsed.flags.all === true;
  const options: CommitOptions = {
    message,
    amend,
    allowEmpty: parsed.flags["allow-empty"] === true,
  };
  const staged = all ? stageTrackedChanges(repo) : repo;
  const result = commit(staged, options);
  const parentTree =
    result.commit.parents.length > 0
      ? staged.commits[result.commit.parents[0] ?? ""]?.tree ?? {}
      : {};
  const changed = diffTrees(parentTree, result.commit.tree).length;
  const branch = currentBranch(result.repo);
  const label = branch
    ? `${branch} ${abbreviate(result.commit.id)}`
    : `detached HEAD ${abbreviate(result.commit.id)}`;
  return {
    repo: result.repo,
    output: commitSummary(label, result.commit, changed),
  };
};

const CONFIG_USAGE = "usage: git config [<options>] <name> [<value>]";

export const configCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["global", "local", "get", "list", "l", "unset", "add"],
    CONFIG_USAGE,
  );
  const key = parsed.positionals[0];
  const value = parsed.positionals[1];
  if (!key) {
    throw new GitError(`error: no config key given\n${CONFIG_USAGE}`);
  }
  if (value === undefined) {
    const current = repo.config[key];
    if (current === undefined) {
      throw new GitError(`error: key '${key}' has no value`);
    }
    return { output: [current] };
  }
  return { repo: setConfig(repo, key, value), output: [] };
};

const RESET_USAGE = "usage: git reset [--soft | --mixed | --hard] [<commit>]";

export const resetCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(parsed, ["soft", "mixed", "hard"], RESET_USAGE);
  const modes = ["soft", "mixed", "hard"].filter(
    (mode) => parsed.flags[mode] === true,
  );
  if (modes.length > 1) {
    throw new GitError("fatal: cannot specify multiple reset modes");
  }
  const mode = (modes[0] ?? "mixed") as ResetMode;
  const revision = parsed.positionals[0];
  const next = reset(repo, { mode, revision });
  if (mode === "hard") {
    const commitAt = headCommit(next);
    return {
      repo: next,
      output: [
        `HEAD is now at ${abbreviate(commitAt.id)} ${commitAt.message}`,
      ],
    };
  }
  return { repo: next, output: [] };
};

const BRANCH_USAGE =
  "usage: git branch [<options>] [<name> [<start-point>]] | -d <name> | --contains <commit>";

function listBranches(
  repo: Repository,
  names: string[],
  verbose: boolean,
  includeRemotes: boolean,
): string[] {
  const current = currentBranch(repo);
  const width =
    names.length > 0
      ? Math.max(...names.map((name) => name.length))
      : 0;
  const lines: string[] = [];
  for (const name of names) {
    const tip = repo.branches[name] ?? "";
    const marker = name === current ? "*" : " ";
    if (verbose) {
      const commitAt = repo.commits[tip];
      lines.push(
        `${marker} ${name.padEnd(width)} ${abbreviate(tip)} ${commitAt?.message ?? ""}`,
      );
    } else {
      lines.push(`${marker} ${name}`);
    }
  }
  if (includeRemotes) {
    for (const ref of Object.keys(repo.remoteTracking).sort()) {
      const tip = repo.remoteTracking[ref] ?? "";
      const commitAt = repo.commits[tip];
      lines.push(
        verbose
          ? `  remotes/${ref} ${abbreviate(tip)} ${commitAt?.message ?? ""}`
          : `  remotes/${ref}`,
      );
    }
  }
  return lines;
}

export const branchCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    [
      "a",
      "all",
      "v",
      "verbose",
      "d",
      "D",
      "r",
      "remotes",
      "contains",
      "merged",
      "no-merged",
      "f",
      "force",
    ],
    BRANCH_USAGE,
  );
  const verbose = parsed.flags.v === true || parsed.flags.verbose === true;
  const includeRemotes =
    parsed.flags.a === true ||
    parsed.flags.all === true ||
    parsed.flags.r === true ||
    parsed.flags.remotes === true;

  if (parsed.flags.d === true || parsed.flags.D === true) {
    const name = parsed.positionals[0];
    if (!name) {
      throw new GitError(`error: branch name required\n${BRANCH_USAGE}`);
    }
    const tip = repo.branches[name];
    if (!tip) {
      throw new GitError(`error: branch '${name}' not found`);
    }
    const hard = parsed.flags.D === true;
    if (!hard && !isAncestor(repo, tip, headCommit(repo).id)) {
      throw new GitError(
        `error: The branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.`,
      );
    }
    const next = deleteBranch(repo, name);
    return {
      repo: next,
      output: [`Deleted branch ${name} (was ${abbreviate(tip)}).`],
    };
  }

  const containsFlag = parsed.flags.contains;
  if (containsFlag !== undefined) {
    const spec =
      containsFlag === true ? parsed.positionals[0] : containsFlag;
    if (!spec) {
      throw new GitError(`error: no commit given\n${BRANCH_USAGE}`);
    }
    const target = resolveRevision(repo, spec);
    const names = Object.keys(repo.branches)
      .sort()
      .filter((name) => {
        const tip = repo.branches[name] ?? "";
        return isAncestor(repo, target, tip);
      });
    const lines = listBranches(repo, names, verbose, false);
    if (includeRemotes) {
      for (const ref of Object.keys(repo.remoteTracking).sort()) {
        const tip = repo.remoteTracking[ref] ?? "";
        if (isAncestor(repo, target, tip)) {
          const commitAt = repo.commits[tip];
          lines.push(
            verbose
              ? `  remotes/${ref} ${abbreviate(tip)} ${commitAt?.message ?? ""}`
              : `  remotes/${ref}`,
          );
        }
      }
    }
    return { output: lines };
  }

  if (parsed.positionals.length === 0) {
    return {
      output: listBranches(
        repo,
        Object.keys(repo.branches).sort(),
        verbose,
        includeRemotes,
      ),
    };
  }
  if (includeRemotes) {
    throw new GitError(
      "fatal: cannot combine listing flags with a branch name",
    );
  }
  const name = parsed.positionals[0] ?? "";
  const start = parsed.positionals[1];
  return { repo: createBranch(repo, name, start), output: [] };
};

const CHECKOUT_USAGE =
  "usage: git checkout [<options>] <branch> | <commit> | -b <new-branch>";

function createAndSwitch(
  repo: Repository,
  name: string,
  start: string | undefined,
): HandlerResult {
  const created = createBranch(repo, name, start);
  const next = checkout(created, name);
  return {
    repo: next,
    output: [`Switched to a new branch '${name}'`],
  };
}

export const checkoutCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["b", "B", "ours", "theirs"]));
  unknownFlags(
    parsed,
    ["b", "B", "ours", "theirs", "f", "force", "detach", "t", "track", "q", "quiet"],
    CHECKOUT_USAGE,
  );
  const ours = typeof parsed.flags.ours === "string" ? parsed.flags.ours : undefined;
  const theirs =
    typeof parsed.flags.theirs === "string" ? parsed.flags.theirs : undefined;

  if (ours !== undefined || theirs !== undefined) {
    const choice: ConflictChoice = ours !== undefined ? "ours" : "theirs";
    const spec = ours ?? theirs ?? "";
    let next = repo;
    let count = 0;
    for (const path of expandPathspecs(repo, spec)) {
      next = resolveConflict(next, path, choice);
      count += 1;
    }
    return {
      repo: next,
      output: [
        `Updated ${count} ${count === 1 ? "path" : "paths"} from the index`,
      ],
    };
  }

  if (parsed.trailing.length > 0) {
    const rev = parsed.positionals[0] ?? "HEAD";
    const sourceTree = treeOf(repo, rev);
    let next = repo;
    let count = 0;
    for (const spec of parsed.trailing) {
      for (const path of expandPathspecs(repo, spec)) {
        const artifact = sourceTree[path];
        if (artifact) {
          next = cloneRepo(next);
          next.working[path] = structuredClone(artifact);
          next.index[path] = structuredClone(artifact);
          count += 1;
        }
      }
    }
    return {
      repo: next,
      output: [
        `Updated ${count} ${count === 1 ? "path" : "paths"} from ${rev === "HEAD" ? "the index" : rev}`,
      ],
    };
  }

  const createName =
    typeof parsed.flags.b === "string"
      ? parsed.flags.b
      : typeof parsed.flags.B === "string"
        ? parsed.flags.B
        : undefined;
  if (createName !== undefined) {
    return createAndSwitch(repo, createName, parsed.positionals[0]);
  }

  const target = parsed.positionals[0];
  if (!target) {
    throw new GitError(`error: a branch or commit is required\n${CHECKOUT_USAGE}`);
  }
  if (!repo.branches[target] && !repo.commits[target]) {
    let matchedPaths: string[] = [];
    try {
      matchedPaths = expandPathspecs(repo, target);
    } catch {
      // Not a path
    }
    if (matchedPaths.length > 0) {
      const headTree = headCommit(repo).tree;
      let next = repo;
      let count = 0;
      for (const path of matchedPaths) {
        const artifact = headTree[path];
        if (artifact) {
          next = cloneRepo(next);
          next.working[path] = structuredClone(artifact);
          next.index[path] = structuredClone(artifact);
          count += 1;
        }
      }
      return {
        repo: next,
        output: [
          `Updated ${count} ${count === 1 ? "path" : "paths"} from the index`,
        ],
      };
    }
  }
  if (repo.branches[target] && currentBranch(repo) === target) {
    return { output: [`Already on '${target}'`] };
  }
  const next = checkout(repo, target);
  if (next.head.kind === "detached") {
    const commitAt = headCommit(next);
    return {
      repo: next,
      output: [
        `Note: switching to '${target}'.`,
        `HEAD is now at ${abbreviate(commitAt.id)} ${commitAt.message}`,
      ],
    };
  }
  const branch = next.head.branch;
  return { repo: next, output: [`Switched to branch '${branch}'`] };
};

const SWITCH_USAGE = "usage: git switch <branch> | -c <new-branch>";

export const switchCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["c", "C"]));
  unknownFlags(
    parsed,
    ["c", "C", "detach", "f", "force", "q", "quiet"],
    SWITCH_USAGE,
  );
  const createName =
    typeof parsed.flags.c === "string"
      ? parsed.flags.c
      : typeof parsed.flags.C === "string"
        ? parsed.flags.C
        : undefined;
  if (createName !== undefined) {
    return createAndSwitch(repo, createName, parsed.positionals[0]);
  }
  const target = parsed.positionals[0];
  if (!target) {
    throw new GitError(`error: a branch is required\n${SWITCH_USAGE}`);
  }
  if (!repo.branches[target]) {
    throw new GitError(`fatal: a branch is expected, got the commit '${target}'`);
  }
  if (currentBranch(repo) === target) {
    return { output: [`Already on '${target}'`] };
  }
  const next = checkout(repo, target);
  return { repo: next, output: [`Switched to branch '${target}'`] };
};

const MERGE_USAGE = "usage: git merge [<options>] [<commit>]";

export const mergeCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["m"]));
  unknownFlags(
    parsed,
    [
      "abort",
      "continue",
      "no-ff",
      "ff",
      "ff-only",
      "squash",
      "m",
      "message",
      "no-edit",
      "edit",
      "q",
      "quiet",
    ],
    MERGE_USAGE,
  );
  if (parsed.flags.abort === true) {
    return { repo: abortMerge(repo), output: [] };
  }
  const target = parsed.positionals[0];
  if (!target) {
    throw new GitError(`error: a merge target is required\n${MERGE_USAGE}`);
  }
  const outcome = merge(repo, target);
  return { repo: outcome.repo, output: formatMergeOutcome(outcome) };
};

const REBASE_USAGE =
  "usage: git rebase [--onto <newbase>] [<upstream>] [<branch>] | --continue | --abort";

export const rebaseCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["onto"]));
  unknownFlags(
    parsed,
    [
      "onto",
      "continue",
      "abort",
      "i",
      "interactive",
      "skip",
      "quit",
      "autosquash",
      "root",
      "f",
      "force-rebase",
      "keep-empty",
    ],
    REBASE_USAGE,
  );
  if (parsed.flags.abort === true) {
    return { repo: abortRebase(repo), output: [] };
  }
  if (parsed.flags.continue === true) {
    const outcome = rebaseContinue(repo);
    return { repo: outcome.repo, output: formatRebaseOutcome(outcome) };
  }
  const onto = typeof parsed.flags.onto === "string" ? parsed.flags.onto : undefined;
  const upstream = parsed.positionals[0];
  const branch = parsed.positionals[1];
  if (onto === undefined && upstream === undefined) {
    throw new GitError(`error: a rebase base is required\n${REBASE_USAGE}`);
  }
  const outcome = rebase(repo, {
    onto: onto ?? upstream ?? "",
    from: onto !== undefined && upstream !== undefined ? upstream : undefined,
    branch,
  });
  return { repo: outcome.repo, output: formatRebaseOutcome(outcome) };
};

const LOG_USAGE = "usage: git log [<options>] [<revision-range>] [--] [<path>]";

export const logCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["n", "max-count"]));
  unknownFlags(
    parsed,
    [
      "oneline",
      "all",
      "graph",
      "n",
      "max-count",
      "decorate",
      "no-decorate",
      "stat",
      "abbrev-commit",
      "reverse",
      "pretty",
      "format",
      "p",
      "patch",
      "follow",
    ],
    LOG_USAGE,
  );
  const query: LogQuery = {};
  const revs: string[] = [];
  const exclude: string[] = [];
  for (const rev of parsed.positionals) {
    if (rev.includes("..")) {
      const [start, end] = rev.split("..");
      if (start) exclude.push(start);
      revs.push(end || "HEAD");
    } else {
      revs.push(rev);
    }
  }
  if (revs.length > 0) query.revs = revs;
  if (exclude.length > 0) query.exclude = exclude;
  if (parsed.flags.all === true) query.all = true;
  if (parsed.trailing.length > 0) query.path = parsed.trailing[0];
  const commits = logQuery(repo, query);
  const limitFlag = parsed.flags.n ?? parsed.flags["max-count"];
  const limit =
    typeof limitFlag === "string" ? Number.parseInt(limitFlag, 10) : undefined;
  const selected =
    limit !== undefined && Number.isFinite(limit) ? commits.slice(0, limit) : commits;
  const oneline =
    parsed.flags.oneline === true ||
    parsed.flags.pretty === "oneline" ||
    parsed.flags.format === "oneline";
  const output: string[] = [];
  for (const commitAt of selected) {
    if (oneline) output.push(formatLogOneline(commitAt));
    else output.push(...formatLogFull(commitAt));
  }
  return { output };
};

const SHOW_USAGE = "usage: git show [<commit>] [--stat]";

export const showCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["stat", "oneline", "format", "pretty", "no-patch", "s", "name-only", "name-status", "patch", "p"],
    SHOW_USAGE,
  );
  const revision = parsed.positionals[0] ?? "HEAD";
  const shown = showCommit(repo, revision);
  const output = formatLogFull(shown.commit);
  if (parsed.flags["no-patch"] === true || parsed.flags.s === true) {
    return { output };
  }
  if (parsed.flags.stat === true) {
    return { output: [...output, ...formatDiffStat(shown.stat)] };
  }
  return { output: [...output, ...formatDiff(shown.stat)] };
};

const LS_TREE_USAGE = "usage: git ls-tree [<options>] <tree-ish> [<path>...]";

export const lsTreeCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["name-only", "name-status", "d", "r", "t", "l", "z", "full-name", "full-tree", "abbrev"],
    LS_TREE_USAGE,
  );
  const revision = parsed.positionals[0];
  if (!revision) {
    throw new GitError(`fatal: no tree-ish given\n${LS_TREE_USAGE}`);
  }
  const entries = lsTree(repo, revision, parsed.positionals[1]);
  const nameOnly =
    parsed.flags["name-only"] === true ||
    parsed.flags["name-status"] === true;
  return {
    output: entries.map((entry) =>
      nameOnly ? entry.path : `${entry.kind} ${entry.path}`,
    ),
  };
};
