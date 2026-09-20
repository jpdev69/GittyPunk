import type { BundleData, Repository } from "../engine";

export interface ExecutionEnv {
  bundles: Record<string, BundleData>;
}

export function emptyEnv(): ExecutionEnv {
  return { bundles: {} };
}

export interface HandlerContext {
  repo: Repository;
  env: ExecutionEnv;
  args: string[];
}

export interface HandlerResult {
  repo?: Repository;
  env?: ExecutionEnv;
  output: string[];
}

export type CommandHandler = (ctx: HandlerContext) => HandlerResult;

export interface CommandResult {
  repo: Repository;
  env: ExecutionEnv;
  output: string[];
  error: boolean;
}
