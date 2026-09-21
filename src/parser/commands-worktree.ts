import {
  GitError,
  cloneRepo,
  diffRefs,
  getStatus,
  headCommit,
  lsFiles,
  removeTracked,
  restoreWorking,
  stage,
  stageAll,
  treeOf,
  unstage,
} from "../engine";
import type { DiffEntry } from "../engine";
import { parseArgs, unknownFlags } from "./args";
import {
  formatDiff,
  formatDiffStat,
  formatStatusLong,
  formatStatusShort,
} from "./format";
import { expandPathspecs } from "./pathspecs";
import type { CommandHandler, HandlerResult } from "./types";

export const initCommand: CommandHandler = (): HandlerResult => ({
  output: ["Reinitialized existing GittyPunk repository in the house"],
});

const STATUS_USAGE =
  "usage: git status [<options>]\n\nExamples:\n  git status\n  git status --short";

export const statusCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["short", "s", "ignored", "long", "porcelain", "no-renames"],
    STATUS_USAGE,
  );
  const status = getStatus(repo);
  const short =
    parsed.flags.short === true ||
    parsed.flags.s === true ||
    parsed.flags.porcelain === true;
  return {
    output: short
      ? formatStatusShort(status)
      : formatStatusLong(repo, status),
  };
};

const ADD_USAGE =
  "usage: git add [<options>] [--] [<pathspec>...]\n\nExamples:\n  git add lowerdeck/sofa\n  git add .";

export const addCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    [
      "p",
      "patch",
      "A",
      "all",
      "u",
      "update",
      "i",
      "interactive",
      "n",
      "dry-run",
      "v",
      "verbose",
    ],
    ADD_USAGE,
  );
  const pick =
    parsed.flags.p === true ||
    parsed.flags.patch === true ||
    parsed.flags.i === true ||
    parsed.flags.interactive === true;
  if (pick) {
    const changes = diffRefs(repo, "HEAD", "working");
    if (changes.length === 0) {
      return { output: [] };
    }
    const lines = changes.map((entry) =>
      entry.before && entry.after
        ? ` ${entry.path} | ${entry.fields.join(", ")}`
        : ` ${entry.path} | ${entry.after ? "new artifact" : "removed"}`,
    );
    lines.push(
      `${countLabel(changes.length, "artifact change")} staged (simplified patch picker)`,
    );
    return { repo: stageAll(repo), output: lines };
  }
  const all =
    parsed.flags.A === true ||
    parsed.flags.all === true ||
    parsed.flags.u === true ||
    parsed.flags.update === true ||
    parsed.positionals.includes(".");
  if (all) {
    return { repo: stageAll(repo), output: [] };
  }
  if (parsed.positionals.length === 0) {
    throw new GitError(
      `Nothing specified, nothing added.\n${ADD_USAGE}\n\nExamples:\n  git add lowerdeck/sofa\n  git add .`,
    );
  }
  let next = repo;
  for (const spec of parsed.positionals) {
    for (const path of expandPathspecs(repo, spec)) {
      next = stage(next, path);
    }
  }
  return { repo: next, output: [] };
};

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

const RM_USAGE =
  "usage: git rm [<options>] [--] <pathspec>...\n\nExamples:\n  git rm lowerdeck/sofa\n  git rm --cached lowerdeck/sofa";

export const rmCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["object", "file"]));
  unknownFlags(
    parsed,
    [
      "cached",
      "r",
      "recursive",
      "f",
      "force",
      "n",
      "dry-run",
      "ignore-unmatch",
      "object",
      "file",
    ],
    RM_USAGE,
  );
  const cached = parsed.flags.cached === true;
  const recursive =
    parsed.flags.r === true ||
    parsed.flags.recursive === true ||
    parsed.flags.f === true ||
    parsed.flags.force === true;
  const specs = [...parsed.positionals];
  for (const key of ["object", "file"] as const) {
    const value = parsed.flags[key];
    if (typeof value === "string") specs.push(value);
  }
  if (specs.length === 0) {
    throw new GitError(
      `fatal: No pathspec was given. Which files should I remove?\n${RM_USAGE}\n\nExamples:\n  git rm lowerdeck/sofa\n  git rm --cached lowerdeck/sofa`,
    );
  }
  const headTree = headCommit(repo).tree;
  let next = repo;
  const removed: string[] = [];
  for (const spec of specs) {
    for (const path of expandPathspecs(repo, spec)) {
      if (!recursive) {
        const artifact = repo.index[path] ?? headTree[path];
        if (artifact && artifact.kind === "component") {
          throw new GitError(
            `fatal: not removing '${path}' recursively without -r`,
          );
        }
      }
      next = removeTracked(next, path, { cached });
      removed.push(path);
    }
  }
  return {
    repo: next,
    output: removed.map((path) => `rm '${path}'`),
  };
};

const RESTORE_USAGE =
  "usage: git restore [--staged] <pathspec>...\n\nExamples:\n  git restore lowerdeck/chair\n  git restore --staged lowerdeck/chair\n  git restore -s HEAD~1 lowerdeck/chair";

export const restoreCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["source", "s"]));
  unknownFlags(
    parsed,
    ["staged", "S", "worktree", "W", "source", "s"],
    RESTORE_USAGE,
  );
  const staged = parsed.flags.staged === true || parsed.flags.S === true;
  const worktree = parsed.flags.worktree === true || parsed.flags.W === true;
  const sourceOpt =
    typeof parsed.flags.source === "string"
      ? parsed.flags.source
      : typeof parsed.flags.s === "string"
        ? parsed.flags.s
        : undefined;

  if (parsed.positionals.length === 0) {
    throw new GitError(
      `fatal: you must specify path(s) to restore\n${RESTORE_USAGE}\n\nExamples:\n  git restore lowerdeck/chair\n  git restore --staged lowerdeck/chair\n  git restore -s HEAD~1 lowerdeck/chair`,
    );
  }

  let next = repo;
  for (const spec of parsed.positionals) {
    for (const path of expandPathspecs(repo, spec)) {
      if (sourceOpt !== undefined) {
        const sourceTree = treeOf(repo, sourceOpt);
        const artifact = sourceTree[path];
        if (!artifact) {
          throw new GitError(
            `error: pathspec '${path}' did not match any file known to git`,
          );
        }
        next = cloneRepo(next);
        if (staged) {
          next.index[path] = structuredClone(artifact);
        }
        if (worktree || !staged) {
          next.working[path] = structuredClone(artifact);
        }
      } else {
        if (staged) {
          next = unstage(next, path);
        }
        if (worktree || !staged) {
          next = restoreWorking(next, path);
        }
      }
    }
  }
  return { repo: next, output: [] };
};

const DIFF_USAGE =
  "usage: git diff [<options>] [<commit>] [<commit>]\n\nExamples:\n  git diff\n  git diff --cached\n  git diff HEAD~1 HEAD";

export const diffCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    [
      "cached",
      "staged",
      "stat",
      "shortstat",
      "name-only",
      "name-status",
      "patch",
      "p",
      "u",
      "no-index",
      "R",
    ],
    DIFF_USAGE,
  );
  const cached = parsed.flags.cached === true || parsed.flags.staged === true;
  if (parsed.positionals.length > 2) {
    throw new GitError(`fatal: too many revisions given\n${DIFF_USAGE}`);
  }
  const revs = parsed.positionals;
  let entries: DiffEntry[];
  if (revs.length === 2) {
    entries = diffRefs(repo, revs[0] ?? "", revs[1] ?? "");
  } else if (revs.length === 1) {
    entries = cached
      ? diffRefs(repo, revs[0] ?? "", "index")
      : diffRefs(repo, revs[0] ?? "", "working");
  } else {
    entries = cached
      ? diffRefs(repo, "HEAD", "index")
      : diffRefs(repo, "index", "working");
  }
  if (parsed.flags.stat === true) {
    return { output: formatDiffStat(entries) };
  }
  return { output: formatDiff(entries) };
};

const LS_FILES_USAGE =
  "usage: git ls-files\n\nExamples:\n  git ls-files";

export const lsFilesCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    [
      "cached",
      "deleted",
      "modified",
      "others",
      "stage",
      "killed",
      "unmerged",
      "s",
    ],
    LS_FILES_USAGE,
  );
  return { output: lsFiles(repo) };
};
