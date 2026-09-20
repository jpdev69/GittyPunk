import { GitError } from "../engine";

export interface ParsedArgs {
  flags: Record<string, string | true>;
  positionals: string[];
  trailing: string[];
}

export function parseArgs(
  args: string[],
  valueFlags: ReadonlySet<string> = new Set(),
): ParsedArgs {
  const flags: Record<string, string | true> = {};
  const positionals: string[] = [];
  const trailing: string[] = [];
  let inTrailing = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (inTrailing) {
      trailing.push(token);
      continue;
    }
    if (token === "--") {
      inTrailing = true;
      continue;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const equals = body.indexOf("=");
      if (equals !== -1) {
        flags[body.slice(0, equals)] = body.slice(equals + 1);
        continue;
      }
      if (valueFlags.has(body)) {
        const value = args[index + 1];
        if (value === undefined || value === "--") {
          throw new GitError(`error: option '${token}' requires a value`);
        }
        flags[body] = value;
        index += 1;
        continue;
      }
      flags[body] = true;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const name = token.slice(1);
      if (valueFlags.has(name)) {
        const value = args[index + 1];
        if (value === undefined || value === "--") {
          throw new GitError(`error: option '${token}' requires a value`);
        }
        flags[name] = value;
        index += 1;
        continue;
      }
      flags[name] = true;
      continue;
    }
    positionals.push(token);
  }
  return { flags, positionals, trailing };
}

export function unknownFlags(
  parsed: ParsedArgs,
  known: string[],
  usage: string,
): void {
  if (parsed.flags.help === true || parsed.flags.h === true) {
    throw new GitError(usage);
  }
  for (const key of Object.keys(parsed.flags)) {
    if (!known.includes(key)) {
      throw new GitError(`error: unknown option \`${key}'\n${usage}`);
    }
  }
}
