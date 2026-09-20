import { describe, expect, it } from "vitest";
import {
  checkout,
  commit,
  createBranch,
  merge,
  resolveConflict,
} from "./ops-history";
import { removeWorkingArtifact } from "./ops-worktree";
import { push } from "./ops-remote";
import { createInitialRepository, headCommit } from "./repo";
import { getStatus, logQuery } from "./queries";
import { moveArtifact, recolorArtifact, stageAndCommit } from "./test-support";

describe("scripted scenario: stage, commit, branch, merge, resolve, push", () => {
  it("runs the full plan scenario", () => {
    let repo = createInitialRepository();

    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    expect(getStatus(repo).clean).toBe(true);

    repo = createBranch(repo, "feature/upside-down");
    repo = checkout(repo, "feature/upside-down");
    repo = removeWorkingArtifact(repo, "structural/roof");
    repo = stageAndCommit(repo, "structural/roof", "Remove roof").repo;

    repo = checkout(repo, "main");
    expect(repo.working["structural/roof"]).toBeDefined();

    repo = recolorArtifact(repo, "structural/roof", "#00ff00");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof green").repo;

    const outcome = merge(repo, "feature/upside-down");
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]?.kind).toBe("modify-delete");

    repo = resolveConflict(outcome.repo, "structural/roof", "theirs");
    const done = commit(repo, {});
    repo = done.repo;
    expect(done.commit.parents).toHaveLength(2);
    expect(done.commit.tree["structural/roof"]).toBeUndefined();
    expect(getStatus(repo).clean).toBe(true);

    const pushed = push(repo);
    expect(pushed.updated).toBe(true);
    expect(pushed.repo.origin.branches["main"]).toBe(repo.branches["main"]);

    const messages = logQuery(repo, {}).map((c) => c.message);
    expect(messages[0]).toBe("Merge branch 'feature/upside-down'");
    expect(messages).toContain("Remove roof");
    expect(messages).toContain("Paint roof green");

    const head = headCommit(repo);
    expect(head.parents).toHaveLength(2);
  });
});
