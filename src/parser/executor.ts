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
    if (tokens[0] !== "git") {
      return {
        repo,
        env,
        output: ["fatal: GittyPunk only understands git commands"],
        error: true,
      };
    }
    const name = tokens[1];
    if (!name) {
      return {
        repo,
        env,
        output: ["usage: git <command> [...]"],
        error: true,
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
