import { canonicalize } from "./hash";
import type { Artifact, ConflictKind, DiffEntry, House } from "./types";

export function housePaths(house: House): string[] {
  return Object.keys(house).sort();
}

export function artifactsEqual(
  a: Artifact | null | undefined,
  b: Artifact | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return canonicalize(a) === canonicalize(b);
}

const COMPARED_FIELDS: Array<[string, (artifact: Artifact) => unknown]> = [
  ["position", (artifact) => artifact.transform.position],
  ["rotation", (artifact) => artifact.transform.rotation],
  ["scale", (artifact) => artifact.transform.scale],
  ["color", (artifact) => artifact.color],
  ["visible", (artifact) => artifact.visible],
  ["kind", (artifact) => artifact.kind],
];

export function diffTrees(before: House, after: House): DiffEntry[] {
  const paths = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();
  const entries: DiffEntry[] = [];
  for (const path of paths) {
    const beforeArtifact = before[path] ?? null;
    const afterArtifact = after[path] ?? null;
    if (artifactsEqual(beforeArtifact, afterArtifact)) continue;
    const fields: string[] = [];
    if (beforeArtifact && afterArtifact) {
      for (const [fieldName, read] of COMPARED_FIELDS) {
        if (
          canonicalize(read(beforeArtifact)) !==
          canonicalize(read(afterArtifact))
        ) {
          fields.push(fieldName);
        }
      }
    }
    entries.push({ path, before: beforeArtifact, after: afterArtifact, fields });
  }
  return entries;
}

export function houseTreesEqual(a: House, b: House): boolean {
  return diffTrees(a, b).length === 0;
}

export function omitPaths(house: House, path: string): House {
  const prefix = `${path}/`;
  const next: House = {};
  for (const [candidate, artifact] of Object.entries(house)) {
    if (candidate === path || candidate.startsWith(prefix)) continue;
    next[candidate] = artifact;
  }
  return next;
}

export function pathExistsInTree(house: House, path: string): boolean {
  const prefix = `${path}/`;
  for (const candidate of Object.keys(house)) {
    if (candidate === path || candidate.startsWith(prefix)) return true;
  }
  return false;
}

export interface PathMergeOutcome {
  result: Artifact | null;
  conflictKind: ConflictKind | null;
}

export function mergePath(
  base: Artifact | null,
  ours: Artifact | null,
  theirs: Artifact | null,
): PathMergeOutcome {
  if (artifactsEqual(ours, theirs)) return { result: ours, conflictKind: null };
  if (artifactsEqual(base, ours)) return { result: theirs, conflictKind: null };
  if (artifactsEqual(base, theirs)) return { result: ours, conflictKind: null };
  const conflictKind: ConflictKind = !base
    ? "add-add"
    : ours && theirs
      ? "both-modified"
      : "modify-delete";
  return { result: ours, conflictKind };
}
