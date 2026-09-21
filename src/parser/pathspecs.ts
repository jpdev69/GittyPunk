import { GitError, headCommit, nameOfPath } from "../engine";
import type { Repository } from "../engine";

export function knownPaths(repo: Repository): Set<string> {
  const paths = new Set<string>();
  for (const tree of [repo.index, repo.working, headCommit(repo).tree]) {
    for (const path of Object.keys(tree)) {
      paths.add(path);
    }
  }
  for (const commitObj of Object.values(repo.commits)) {
    for (const path of Object.keys(commitObj.tree)) {
      paths.add(path);
    }
  }
  for (const commitObj of Object.values(repo.origin.commits)) {
    for (const path of Object.keys(commitObj.tree)) {
      paths.add(path);
    }
  }
  return paths;
}

export function expandPathspecs(repo: Repository, spec: string): string[] {
  const candidates = knownPaths(repo);
  if (candidates.has(spec)) return [spec];
  const prefix = spec.endsWith("/") ? spec : `${spec}/`;
  const under = [...candidates]
    .filter((path) => path.startsWith(prefix))
    .sort();
  if (under.length > 0) return under;
  if (!spec.includes("/")) {
    const byName = [...candidates]
      .filter((path) => nameOfPath(path) === spec)
      .sort();
    if (byName.length === 1) return [byName[0] as string];
    if (byName.length > 1) {
      throw new GitError(
        `fatal: ambiguous artifact '${spec}' (use the full path)`,
      );
    }
  }
  throw new GitError(`fatal: pathspec '${spec}' did not match any files`);
}
