import { describe, expect, it } from "vitest";
import { checkout, createBranch, resolveConflict } from "./ops-history";
import { abortRebase, rebase, rebaseContinue } from "./ops-rewrite";
import { createInitialRepository, currentBranch, headCommit } from "./repo";
import { getStatus, logQuery } from "./queries";
import { moveArtifact, recolorArtifact, stageAndCommit } from "./test-support";
import type { Repository } from "./types";

function makeDiverged(): Repository {
  let repo = createInitialRepository();
  repo = createBranch(repo, "feature");
  repo = checkout(repo, "feature");
  repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
  repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
  repo = recolorArtifact(repo, "lowerdeck/tv", "#222222");
  repo = stageAndCommit(repo, "lowerdeck/tv", "Recolor tv").repo;
  repo = checkout(repo, "main");
  repo = recolorArtifact(repo, "lowerdeck/sofa", "#111111");
  repo = stageAndCommit(repo, "lowerdeck/sofa", "Recolor sofa").repo;
  return checkout(repo, "feature");
}

describe("rebase", () => {
  it("replays feature commits onto the new upstream tip", () => {
    let repo = makeDiverged();
    const mainTip = repo.branches["main"];
    repo = checkout(repo, "feature");
    const outcome = rebase(repo, { onto: "main" });
    expect(outcome.conflicts).toHaveLength(0);
    expect(outcome.replayed).toBe(2);
    const head = headCommit(outcome.repo);
    const replayedTable = outcome.repo.commits[head.parents[0] as string];
    expect(replayedTable?.parents[0]).toBe(mainTip);
    const messages = logQuery(outcome.repo, { revs: ["feature"] }).map((c) => c.message);
    expect(messages).toEqual(["Recolor tv", "Move table", "Recolor sofa", "Initial house"]);
    expect(head.tree["lowerdeck/table"].transform.position).toEqual([5, 0.4, 0]);
    expect(head.tree["lowerdeck/tv"].color).toBe("#222222");
    expect(head.tree["lowerdeck/sofa"].color).toBe("#111111");
    expect(getStatus(outcome.repo).clean).toBe(true);
  });

  it("supports --onto with an explicit merge base and branch", () => {
    let repo = makeDiverged();
    repo = checkout(repo, "main");
    const initialId = logQuery(repo).find((c) => c.message === "Initial house")?.id as string;
    const outcome = rebase(repo, { onto: "main", from: initialId, branch: "feature" });
    expect(currentBranch(outcome.repo)).toBe("feature");
    expect(outcome.conflicts).toHaveLength(0);
    const head = headCommit(outcome.repo);
    const replayedFirst = outcome.repo.commits[head.parents[0] as string];
    expect(replayedFirst?.parents[0]).toBe(outcome.repo.branches["main"]);
    expect(head.tree["lowerdeck/sofa"].color).toBe("#111111");
  });

  it("drops requested commits like an interactive rebase", () => {
    let repo = makeDiverged();
    repo = checkout(repo, "feature");
    const outcome = rebase(repo, { onto: "main", drop: ["Move table"] });
    const messages = logQuery(outcome.repo, { revs: ["feature"] }).map((c) => c.message);
    expect(messages).not.toContain("Move table");
    expect(messages).toContain("Recolor tv");
    expect(headCommit(outcome.repo).tree["lowerdeck/table"].transform.position).toEqual([-0.5, 0.4, 1.6]);
  });

  it("stops on conflicts and continues after resolution", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#00ff00");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Feature sofa").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#ff0000");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Main sofa").repo;
    repo = checkout(repo, "feature");
    const mainTip = repo.branches["main"];
    const outcome = rebase(repo, { onto: "main" });
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]?.kind).toBe("both-modified");
    expect(outcome.repo.rebase).not.toBeNull();
    const status = getStatus(outcome.repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/sofa");
    expect(entry?.worktree).toBe("conflict");
    const mid = resolveConflict(outcome.repo, "lowerdeck/sofa", "theirs");
    const done = rebaseContinue(mid);
    expect(done.conflicts).toHaveLength(0);
    expect(done.repo.rebase).toBeNull();
    const head = headCommit(done.repo);
    expect(head.tree["lowerdeck/sofa"].color).toBe("#00ff00");
    expect(head.parents[0]).toBe(mainTip);
    expect(head.message).toBe("Feature sofa");
    expect(getStatus(done.repo).clean).toBe(true);
  });

  it("aborts a conflicted rebase restoring the pre-rebase state", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#00ff00");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Feature sofa").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#ff0000");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Main sofa").repo;
    repo = checkout(repo, "feature");
    const featureTip = repo.branches["feature"];
    const outcome = rebase(repo, { onto: "main" });
    const restored = abortRebase(outcome.repo);
    expect(restored.rebase).toBeNull();
    expect(getStatus(restored).clean).toBe(true);
    expect(restored.branches["feature"]).toBe(featureTip);
    expect(restored.working["lowerdeck/sofa"].color).toBe("#00ff00");
  });

  it("refuses to rebase with uncommitted changes", () => {
    let repo = makeDiverged();
    repo = checkout(repo, "feature");
    repo = moveArtifact(repo, "lowerdeck/chair", [2, 0.4, 2]);
    expect(() => rebase(repo, { onto: "main" })).toThrow(/unstaged changes/);
  });

  it("is a no-op when already up to date", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    const outcome = rebase(repo, { onto: "main" });
    expect(outcome.alreadyUpToDate).toBe(true);
  });
});
