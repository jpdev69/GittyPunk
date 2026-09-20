import { GitError } from "../engine";
import type { Repository } from "../engine";
import {
  addCommand,
  diffCommand,
  initCommand,
  lsFilesCommand,
  restoreCommand,
  rmCommand,
  statusCommand,
} from "./commands-worktree";
import {
  branchCommand,
  checkoutCommand,
  commitCommand,
  configCommand,
  logCommand,
  lsTreeCommand,
  mergeCommand,
  rebaseCommand,
  resetCommand,
  showCommand,
  switchCommand,
} from "./commands-history";
import {
  bundleCommand,
  cloneCommand,
  fetchCommand,
  filterRepoCommand,
  pullCommand,
  pushCommand,
  remoteCommand,
} from "./commands-remote";
import { tokenize } from "./tokenizer";
import { emptyEnv } from "./types";
import type {
  CommandHandler,
  CommandResult,
  ExecutionEnv,
  HandlerContext,
} from "./types";

const COMMANDS: Record<string, CommandHandler> = {
  init: initCommand,
  status: statusCommand,
  add: addCommand,
  rm: rmCommand,
  restore: restoreCommand,
  diff: diffCommand,
  "ls-files": lsFilesCommand,
  commit: commitCommand,
  config: configCommand,
  reset: resetCommand,
  branch: branchCommand,
  checkout: checkoutCommand,
  switch: switchCommand,
  merge: mergeCommand,
  rebase: rebaseCommand,
  log: logCommand,
  show: showCommand,
  "ls-tree": lsTreeCommand,
  fetch: fetchCommand,
  pull: pullCommand,
  push: pushCommand,
  remote: remoteCommand,
  bundle: bundleCommand,
  clone: cloneCommand,
  "filter-repo": filterRepoCommand,
};

const HELP_LINES: string[] = [
  "GittyPunk Git Simulation Commands:",
  "",
  "  Worktree & Staging:",
  "    git status                  Show house status",
  "    git add <artifact>          Stage artifact changes to the blueprint",
  "    git rm <artifact>           Remove artifact from house and blueprint",
  "    git restore <artifact>      Discard working house changes",
  "    git diff                    Show differences (working vs index/commit)",
  "    git ls-files                List tracked house artifacts",
  "",
  "  History & Commits:",
  "    git commit -m \"<msg>\"       Save snapshot of staged blueprint",
  "    git log                     Show commit history",
  "    git show [<rev>]            Inspect a commit",
  "    git reset [--hard|--soft]   Reset house to a previous commit",
  "",
  "  Branches & Merges:",
  "    git branch                  List or create branches",
  "    git switch / git checkout   Switch branches or inspect commits",
  "    git merge <branch>          Merge branch into current house",
  "    git rebase <branch>         Rebase house commits onto branch",
  "",
  "  Remote Sync (origin):",
  "    git fetch                   Fetch updates from simulated origin",
  "    git pull                    Fetch and merge remote changes",
  "    git push                    Push local commits to simulated origin",
  "    git bundle / git clone      Save or restore house bundle",
];

export function executeCommand(
  input: string,
  repo: Repository,
  env: ExecutionEnv = emptyEnv(),
): CommandResult {
  try {
    const tokens = tokenize(input);
    if (tokens.length === 0) {
      return { repo, env, output: [], error: false };
    }
    const first = tokens[0] ?? "";
    if (
      first === "clear" ||
      first === "cls" ||
      (first === "git" && (tokens[1] === "clear" || tokens[1] === "cls"))
    ) {
      return { repo, env, output: ["__CLEAR__"], error: false };
    }
    if (first === "help") {
      return { repo, env, output: HELP_LINES, error: false };
    }
    if (first !== "git") {
      return {
        repo,
        env,
        output: ["fatal: GittyPunk only understands git commands"],
        error: true,
      };
    }
    const name = tokens[1];
    if (
      !name ||
      name === "help" ||
      name === "--help" ||
      name === "-h" ||
      name === "--version" ||
      name === "-v"
    ) {
      return {
        repo,
        env,
        output: HELP_LINES,
        error: false,
      };
    }
    const handler = COMMANDS[name];
    if (!handler) {
      return {
        repo,
        env,
        output: [`git: '${name}' is not a git command. See 'git --help'.`],
        error: true,
      };
    }
    const ctx: HandlerContext = { repo, env, args: tokens.slice(2) };
    const result = handler(ctx);
    return {
      repo: result.repo ?? repo,
      env: result.env ?? env,
      output: result.output,
      error: false,
    };
  } catch (error) {
    if (error instanceof GitError) {
      return { repo, env, output: error.message.split("\n"), error: true };
    }
    throw error;
  }
}
