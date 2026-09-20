export type ArtifactKind = "component" | "artifact";

export type Vec3 = [number, number, number];

export interface Transform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface Artifact {
  id: string;
  name: string;
  kind: ArtifactKind;
  parent: string | null;
  transform: Transform;
  color: string;
  visible: boolean;
}

export type House = Record<string, Artifact>;

export interface Commit {
  id: string;
  message: string;
  parents: string[];
  tree: House;
  author: string;
  timestamp: number;
}

export type Head =
  | { kind: "branch"; branch: string }
  | { kind: "detached"; commit: string };

export interface RemoteHouse {
  commits: Record<string, Commit>;
  branches: Record<string, string>;
}

export type ConflictKind = "both-modified" | "modify-delete" | "add-add";

export interface Conflict {
  path: string;
  kind: ConflictKind;
  ours: Artifact | null;
  theirs: Artifact | null;
  base: Artifact | null;
}

export interface MergeState {
  kind: "merge";
  branch: string;
  oursHead: string;
  theirsHead: string;
  defaultMessage: string;
  conflicts: Conflict[];
  headBeforeMerge: Head;
  workingBeforeMerge: House;
  indexBeforeMerge: House;
}

export interface RebaseSnapshot {
  head: Head;
  working: House;
  index: House;
}

export interface RebaseState {
  kind: "rebase";
  onto: string;
  newHead: string;
  queue: string[];
  conflicts: Conflict[];
  snapshot: RebaseSnapshot;
  branch: string | null;
}

export interface Repository {
  commits: Record<string, Commit>;
  branches: Record<string, string>;
  head: Head;
  working: House;
  index: House;
  origin: RemoteHouse;
  remoteTracking: Record<string, string>;
  remotes: Record<string, string>;
  config: Record<string, string>;
  merge: MergeState | null;
  rebase: RebaseState | null;
  clock: number;
}

export interface DiffEntry {
  path: string;
  before: Artifact | null;
  after: Artifact | null;
  fields: string[];
}

export type StagedChange = "added" | "removed" | "modified" | null;
export type WorktreeChange =
  | "added"
  | "removed"
  | "modified"
  | "untracked"
  | "conflict"
  | null;

export interface StatusEntry {
  path: string;
  staged: StagedChange;
  worktree: WorktreeChange;
}

export interface RepoStatus {
  detached: boolean;
  branch: string | null;
  clean: boolean;
  entries: StatusEntry[];
  ahead: number;
  behind: number;
  merging: boolean;
  rebasing: boolean;
}

export interface BundleData {
  format: "gittypunk-bundle";
  version: 1;
  commits: Record<string, Commit>;
  branches: Record<string, string>;
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}
