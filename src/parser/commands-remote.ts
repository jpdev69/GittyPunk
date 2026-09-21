import {
  GitError,
  addRemote,
  bundleCreate,
  cloneFromBundle,
  currentBranch,
  fetch,
  pull,
  purgePath,
  push,
  setConfig,
} from "../engine";
import { parseArgs, unknownFlags } from "./args";
import {
  formatFetchUpdate,
  formatMergeOutcome,
  formatPushUpdate,
  formatRebaseOutcome,
} from "./format";
import type { CommandHandler, ExecutionEnv } from "./types";

const FETCH_USAGE = "usage: git fetch [<remote>] [<branch>...]";

export const fetchCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["all", "prune", "tags", "v", "verbose", "q", "quiet", "dry-run"],
    FETCH_USAGE,
  );
  const remote = parsed.positionals[0] ?? "origin";
  const previous = { ...repo.remoteTracking };
  const result = fetch(repo, remote);
  const lines: string[] = [];
  if (result.updatedBranches.length > 0) {
    const url = repo.remotes[remote] ?? remote;
    lines.push(`From ${url}`);
    for (const branch of result.updatedBranches.sort()) {
      const tracking = result.repo.remoteTracking[`origin/${branch}`] ?? "";
      lines.push(
        formatFetchUpdate(branch, previous[`origin/${branch}`], tracking),
      );
    }
  }
  return { repo: result.repo, output: lines };
};

const PULL_USAGE = "usage: git pull [<remote>]";

export const pullCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    [
      "rebase",
      "no-rebase",
      "ff",
      "ff-only",
      "autostash",
      "squash",
      "v",
      "verbose",
      "q",
      "quiet",
    ],
    PULL_USAGE,
  );
  const remote = parsed.positionals[0] ?? "origin";
  let base = repo;
  if (parsed.flags.rebase === true) {
    base = setConfig(repo, "pull.rebase", "true");
  }
  if (parsed.flags["no-rebase"] === true) {
    base = setConfig(base, "pull.rebase", "false");
  }
  const result = pull(base, remote);
  const output =
    "replayed" in result ? formatRebaseOutcome(result) : formatMergeOutcome(result);
  return { repo: result.repo, output };
};

const PUSH_USAGE = "usage: git push [<remote>] [<branch>]";

export const pushCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    [
      "force-with-lease",
      "f",
      "force",
      "u",
      "set-upstream",
      "all",
      "tags",
      "delete",
      "d",
      "prune",
      "v",
      "verbose",
      "q",
      "quiet",
      "dry-run",
    ],
    PUSH_USAGE,
  );
  const lease =
    parsed.flags["force-with-lease"] !== undefined ||
    parsed.flags.f === true ||
    parsed.flags.force === true;
  const setUpstream =
    parsed.flags.u === true || parsed.flags["set-upstream"] === true;
  const remote = parsed.positionals[0] ?? "origin";
  const branchOption = parsed.positionals[1];
  const current = currentBranch(repo);
  const target = branchOption ?? current ?? "";
  const previous = repo.origin.branches[target];
  const result = push(repo, {
    remote: parsed.positionals[0] ? remote : undefined,
    branch: branchOption ?? undefined,
    forceWithLease: lease,
    setUpstream,
  });
  if (!result.updated) {
    return { repo: result.repo, output: ["Everything up-to-date"] };
  }
  const url = repo.remotes[remote] ?? remote;
  const newId = result.repo.remoteTracking[`origin/${result.branch}`] ?? "";
  return {
    repo: result.repo,
    output: formatPushUpdate(url, result.branch, previous, newId),
  };
};

const REMOTE_USAGE = "usage: git remote [-v] | add <name> <url>";

export const remoteCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["v", "verbose", "t", "show", "prune", "update"],
    REMOTE_USAGE,
  );
  const [subcommand, name, url] = parsed.positionals;
  if (subcommand === "add") {
    if (!name || !url) {
      throw new GitError(
        `error: remote add requires a name and a url\n${REMOTE_USAGE}\n\nExamples:\n  git remote add origin https://gittypunk.local/house.git`,
      );
    }
    return { repo: addRemote(repo, name, url), output: [] };
  }
  if (subcommand !== undefined) {
    throw new GitError(`error: Unknown subcommand: ${subcommand}`);
  }
  const verbose = parsed.flags.v === true || parsed.flags.verbose === true;
  if (verbose) {
    const lines: string[] = [];
    for (const [remoteName, remoteUrl] of Object.entries(repo.remotes).sort(
      (a, b) => a[0].localeCompare(b[0]),
    )) {
      lines.push(`${remoteName}\t${remoteUrl} (fetch)`);
      lines.push(`${remoteName}\t${remoteUrl} (push)`);
    }
    return { output: lines };
  }
  return { output: Object.keys(repo.remotes).sort() };
};

const BUNDLE_USAGE = "usage: git bundle create <file> --all";

function basename(path: string): string {
  const parts = path
    .split(/[\\/]+/)
    .filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last ?? path;
}

export const bundleCommand: CommandHandler = ({ repo, env, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["all", "v", "verbose", "q", "quiet", "progress"],
    BUNDLE_USAGE,
  );
  const subcommand = parsed.positionals[0];
  if (subcommand !== "create") {
    throw new GitError(
      `error: git bundle: '${subcommand ?? ""}' is not a valid subcommand\n${BUNDLE_USAGE}\n\nExamples:\n  git bundle create house.bundle --all`,
    );
  }
  const file = parsed.positionals[1];
  if (!file) {
    throw new GitError(
      `error: bundle create requires a file name\n${BUNDLE_USAGE}\n\nExamples:\n  git bundle create house.bundle --all`,
    );
  }
  const bundle = bundleCreate(repo);
  const name = basename(file);
  const nextEnv: ExecutionEnv = { bundles: { ...env.bundles, [name]: bundle } };
  return {
    env: nextEnv,
    output: [
      `Created bundle "${name}" with ${Object.keys(bundle.commits).length} commits.`,
    ],
  };
};

const CLONE_USAGE = "usage: git clone <bundle>";

export const cloneCommand: CommandHandler = ({ env, args }) => {
  const parsed = parseArgs(args);
  unknownFlags(
    parsed,
    ["v", "verbose", "q", "quiet", "n", "no-checkout", "bare", "mirror", "depth"],
    CLONE_USAGE,
  );
  const name = parsed.positionals[0];
  if (!name) {
    throw new GitError(
      `error: git clone requires a bundle name\n${CLONE_USAGE}\n\nExamples:\n  git clone house.bundle`,
    );
  }
  const bundle = env.bundles[name] ?? env.bundles[basename(name)];
  if (!bundle) {
    throw new GitError(`fatal: could not find bundle '${name}'`);
  }
  return {
    repo: cloneFromBundle(bundle),
    output: [`Cloning from bundle "${name}"...`, "done."],
  };
};

const FILTER_REPO_USAGE =
  "usage: git filter-repo --force --invert-paths --path <path>\n\nExamples:\n  git filter-repo --force --invert-paths --path lowerdeck/tv";

export const filterRepoCommand: CommandHandler = ({ repo, args }) => {
  const parsed = parseArgs(args, new Set(["path", "paths"]));
  unknownFlags(
    parsed,
    ["force", "invert-paths", "path", "paths", "s", "state"],
    FILTER_REPO_USAGE,
  );
  if (parsed.flags.force !== true) {
    throw new GitError("fatal: refusing to rewrite history without --force");
  }
  if (parsed.flags["invert-paths"] !== true) {
    throw new GitError(
      "fatal: only --invert-paths filters are supported in GittyPunk",
    );
  }
  const pathFlag = parsed.flags.path ?? parsed.flags.paths;
  const path = typeof pathFlag === "string" ? pathFlag : undefined;
  if (!path) {
    throw new GitError(`fatal: no --path given\n${FILTER_REPO_USAGE}`);
  }
  const result = purgePath(repo, path);
  return {
    repo: result.repo,
    output: [
      `Rewrote ${result.rewritten} ${result.rewritten === 1 ? "commit" : "commits"} to remove '${path}'.`,
      "Remote-tracking references were reset; fetch or push again to restore them.",
    ],
  };
};
