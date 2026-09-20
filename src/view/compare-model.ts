import { diffTrees, treeOf } from "../engine";
import type { Artifact, Repository, Vec3 } from "../engine";

export interface CompareChange {
  path: string;
  added: boolean;
  removed: boolean;
  moved: boolean;
  rotated: boolean;
  recolored: boolean;
  rescaled: boolean;
  retoggled: boolean;
  before: Artifact | null;
  after: Artifact | null;
  fromPosition: Vec3 | null;
}

export function compareChanges(
  repo: Repository,
  from: string,
  to: string,
): CompareChange[] {
  const fromTree = treeOf(repo, from);
  const toTree = treeOf(repo, to);
  return diffTrees(fromTree, toTree).map((entry) => ({
    path: entry.path,
    added: entry.before === null,
    removed: entry.after === null,
    moved: entry.fields.includes("position"),
    rotated: entry.fields.includes("rotation"),
    recolored: entry.fields.includes("color"),
    rescaled: entry.fields.includes("scale"),
    retoggled: entry.fields.includes("visible"),
    before: entry.before,
    after: entry.after,
    fromPosition: entry.before
      ? entry.before.transform.position
      : null,
  }));
}
