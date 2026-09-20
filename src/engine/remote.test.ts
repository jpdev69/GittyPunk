import { describe, expect, it } from "vitest";
import {
  addRemote,
  applyOriginUpdate,
  bundleCreate,
  cloneFromBundle,
  fetch,
  pull,
  push,
  setConfig,
} from "./ops-remote";
import { checkout, commit, resolveConflict } from "./ops-history";
import { createInitialRepository, currentBranch, headCommit } from "./repo";
import { getStatus, logQuery as log } from "./queries";
import {
  moveArtifact,
  recolorArtifact,
  stageAndCommit,
} from "./test-support";
import type { Repository, RemoteHouse } from "./types";

function colleagueDiverge(base: Repository): { origin: RemoteHouse } {
  const colleague = cloneFromBundle(bundleCreate(base));
  const moved = moveArtifact(colleague, "lowerdeck/table", [5, 0.4, 0]);
  const committed = stageAndCommit(moved, "lowerdeck/table", "Colleague move").repo;
  const pushed = push(committed);
  return { origin: pushed.repo.origin };
}

describe("push", () => {
  it("creates the remote branch on first push", () => {
    const repo = createInitialRepository();
    const outcome = push(repo);
    expect(outcome.updated).toBe(true);
    expect(outcome.repo.origin.branches["main"]).toBe(repo.branches["main"]);
    expect(getStatus(outcome.repo).ahead).toBe(0);
  });

  it("is a no-op when already up to date", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    const again = push(repo);
    expect(again.updated).toBe(false);
  });

  it("rejects non-fast-forward pushes", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo).origin);
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#111111");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Local sofa").repo;
    expect(() => push(repo)).toThrow(/non-fast-forward/);
  });

  it("rejects stale force-with-lease and accepts it after fetch", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo).origin);
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#111111");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Local sofa").repo;
    expect(() => push(repo, { forceWithLease: true })).toThrow(/stale info/);
    repo = fetch(repo).repo;
    const forced = push(repo, { forceWithLease: true });
    expect(forced.updated).toBe(true);
    expect(forced.repo.origin.branches["main"]).toBe(repo.branches["main"]);
  });

  it("refuses pushing while detached", () => {
    let repo = createInitialRepository();
    repo = checkout(repo, headCommit(repo).id);
    expect(() => push(repo)).toThrow(/not currently on a branch/);
  });
});

describe("fetch and pull", () => {
  it("fetch updates remote tracking without touching the working tree", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    const origin = colleagueDiverge(repo).origin;
    repo = applyOriginUpdate(repo, origin);
    const fetched = fetch(repo);
    expect(fetched.repo.remoteTracking["origin/main"]).toBe(origin.branches["main"]);
    expect(getStatus(fetched.repo).behind).toBe(1);
    expect(getStatus(fetched.repo).clean).toBe(true);
  });

  it("pull merges remote changes", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    const origin = colleagueDiverge(repo).origin;
    repo = applyOriginUpdate(repo, origin);
    const outcome = pull(repo);
    expect(outcome.fastForward).toBe(true);
    expect(outcome.repo.working["lowerdeck/table"].transform.position).toEqual([5, 0.4, 0]);
    expect(getStatus(outcome.repo).clean).toBe(true);
    expect(outcome.repo.branches["main"]).toBe(origin.branches["main"]);
  });

  it("pull rebases when pull.rebase is true", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    const origin = colleagueDiverge(repo).origin;
    repo = applyOriginUpdate(repo, origin);
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#111111");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Local sofa").repo;
    repo = setConfig(repo, "pull.rebase", "true");
    const outcome = pull(repo);
    expect("replayed" in outcome).toBe(true);
    if (!("replayed" in outcome)) throw new Error("expected rebase outcome");
    expect(outcome.replayed).toBe(1);
    const head = headCommit(outcome.repo);
    expect(head.message).toBe("Local sofa");
    expect(head.parents[0]).toBe(origin.branches["main"]);
    expect(head.tree["lowerdeck/table"].transform.position).toEqual([5, 0.4, 0]);
    expect(head.tree["lowerdeck/sofa"].color).toBe("#111111");
  });

  it("pull without upstream errors", () => {
    const repo = createInitialRepository();
    expect(() => pull(repo)).toThrow(/no upstream/);
  });

  it("pull can conflict with colleague changes", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    const colleague = cloneFromBundle(bundleCreate(repo));
    const colleagueMoved = recolorArtifact(colleague, "lowerdeck/sofa", "#00ff00");
    const colleaguePushed = push(
      stageAndCommit(colleagueMoved, "lowerdeck/sofa", "Colleague sofa").repo,
    );
    repo = applyOriginUpdate(repo, colleaguePushed.repo.origin);
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#ff0000");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Local sofa").repo;
    const outcome = pull(repo);
    expect(outcome.conflicts).toHaveLength(1);
    const merged = resolveConflict(outcome.repo, "lowerdeck/sofa", "theirs");
    const done = commit(merged, {});
    expect(done.commit.parents).toHaveLength(2);
    expect(done.commit.tree["lowerdeck/sofa"].color).toBe("#00ff00");
    expect(getStatus(done.repo).clean).toBe(true);
  });
});

describe("bundle create and clone", () => {
  it("round-trips history through a bundle", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    repo = push(repo).repo;
    const bundle = bundleCreate(repo);
    const clone = cloneFromBundle(bundle);
    expect(clone.working).toEqual(repo.working);
    expect(log(clone, {}).map((c) => c.message)).toEqual(["Move table", "Initial house"]);
    expect(clone.remoteTracking["origin/main"]).toBe(repo.branches["main"]);
    expect(currentBranch(clone)).toBe("main");
    const cloneChanged = recolorArtifact(clone, "lowerdeck/sofa", "#123456");
    const pushed = push(stageAndCommit(cloneChanged, "lowerdeck/sofa", "Clone change").repo);
    expect(pushed.updated).toBe(true);
  });

  it("rejects malformed bundles", () => {
    const bundle = bundleCreate(createInitialRepository());
    expect(() => cloneFromBundle({ ...bundle, version: 99 as never })).toThrow(/unrecognized/);
  });
});

describe("remotes", () => {
  it("adds remotes and refuses duplicates", () => {
    const repo = createInitialRepository();
    const added = addRemote(repo, "backup", "https://gittypunk.local/backup.git");
    expect(added.remotes["backup"]).toBe("https://gittypunk.local/backup.git");
    expect(() => addRemote(added, "backup", "x")).toThrow(/already exists/);
    expect(() => fetch(added, "backup")).toThrow(/simulates only the 'origin'/);
  });

  it("rejects unknown remotes", () => {
    const repo = createInitialRepository();
    expect(() => fetch(repo, "ghost")).toThrow(/does not appear to be a repository/);
  });
});
