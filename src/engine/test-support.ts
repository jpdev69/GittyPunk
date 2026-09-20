import { makeArtifact } from "./house";
import { upsertArtifact, stage } from "./ops-worktree";
import { commit } from "./ops-history";
import type { CommitResult } from "./ops-history";
import type { Repository, Vec3 } from "./types";

export function moveArtifact(
  repo: Repository,
  path: string,
  position: Vec3,
): Repository {
  const artifact = repo.working[path];
  if (!artifact) throw new Error(`test setup: missing working artifact '${path}'`);
  return upsertArtifact(repo, {
    ...artifact,
    transform: { ...artifact.transform, position },
  });
}

export function rotateArtifact(
  repo: Repository,
  path: string,
  rotation: Vec3,
): Repository {
  const artifact = repo.working[path];
  if (!artifact) throw new Error(`test setup: missing working artifact '${path}'`);
  return upsertArtifact(repo, {
    ...artifact,
    transform: { ...artifact.transform, rotation },
  });
}

export function recolorArtifact(
  repo: Repository,
  path: string,
  color: string,
): Repository {
  const artifact = repo.working[path];
  if (!artifact) throw new Error(`test setup: missing working artifact '${path}'`);
  return upsertArtifact(repo, { ...artifact, color });
}

export function hideArtifact(repo: Repository, path: string): Repository {
  const artifact = repo.working[path];
  if (!artifact) throw new Error(`test setup: missing working artifact '${path}'`);
  return upsertArtifact(repo, { ...artifact, visible: false });
}

export function addNewArtifact(
  repo: Repository,
  path: string,
  color = "#ff00ff",
): Repository {
  return upsertArtifact(repo, makeArtifact(path, { color }));
}

export function stageAndCommit(
  repo: Repository,
  path: string,
  message: string,
): CommitResult {
  return commit(stage(repo, path), { message });
}
