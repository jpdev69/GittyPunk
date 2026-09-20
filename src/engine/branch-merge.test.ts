import { describe, expect, it } from "vitest";
import {
  abortMerge,
  checkout,
  commit,
  createBranch,
  deleteBranch,
  merge,
  resolveConflict,
} from "./ops-history";
import { removeWorkingArtifact } from "./ops-worktree";
import { createInitialRepository, currentBranch, headCommit } from "./repo";
import { getStatus, logQuery } from "./queries";
import {
  moveArtifact,
  recolorArtifact,
  stageAndCommit,
} from "./test-support";

describe("branches", () => {
  it("creates a branch at HEAD and switches to it", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature/upside-down");
    repo = checkout(repo, "feature/upside-down");
    expect(currentBranch(repo)).toBe("feature/upside-down");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    expect(
      logQuery(repo, { revs: ["main"] }).some((c) => c.message === "Move table"),
    ).toBe(false);
    expect(
      logQuery(repo, { revs: ["feature/upside-down"] }).some((c) => c.message === "Move table"),
    ).toBe(true);
  });

  it("refuses duplicate branch names", () => {
    const repo = createInitialRepository();
    expect(() => createBranch(repo, "main")).toThrow(/already exists/);
  });

  it("refuses deleting the checked out branch", () => {
    const repo = createInitialRepository();
    expect(() => deleteBranch(repo, "main")).toThrow(/checked out/);
  });

  it("checkout carries compatible unstaged changes", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "other");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = checkout(repo, "other");
    const entry = getStatus(repo).entries.find((entry) => entry.path === "lowerdeck/table");
    expect(entry?.worktree).toBe("modified");
  });

  it("checkout blocks incompatible unstaged changes", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "other");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    repo = moveArtifact(repo, "lowerdeck/table", [9, 0.4, 0]);
    expect(() => checkout(repo, "other")).toThrow(/would be overwritten/);
  });

  it("checks out detached at a sha", () => {
    let repo = createInitialRepository();
    const tip = headCommit(repo).id;
    repo = checkout(repo, tip);
    expect(repo.head.kind).toBe("detached");
    expect(getStatus(repo).detached).toBe(true);
  });

  it("rejects unknown checkout targets", () => {
    const repo = createInitialRepository();
    expect(() => checkout(repo, "nope")).toThrow(/pathspec/);
  });
});

describe("merge", () => {
  it("fast-forwards when the target is ahead", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    const result = stageAndCommit(repo, "lowerdeck/table", "Move table");
    repo = result.repo;
    repo = checkout(repo, "main");
    const outcome = merge(repo, "feature");
    expect(outcome.fastForward).toBe(true);
    expect(outcome.repo.branches["main"]).toBe(result.commit.id);
    expect(getStatus(outcome.repo).clean).toBe(true);
  });

  it("is already up to date when the target is behind", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    const outcome = merge(repo, "feature");
    expect(outcome.alreadyUpToDate).toBe(true);
  });

  it("auto-merges disjoint changes with a merge commit", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#111111");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Recolor sofa").repo;
    const outcome = merge(repo, "feature");
    expect(outcome.conflicts).toHaveLength(0);
    const head = headCommit(outcome.repo);
    expect(head.parents).toHaveLength(2);
    expect(head.message).toBe("Merge branch 'feature'");
    expect(head.tree["lowerdeck/table"].transform.position).toEqual([5, 0.4, 0]);
    expect(head.tree["lowerdeck/sofa"].color).toBe("#111111");
    expect(getStatus(outcome.repo).clean).toBe(true);
  });

  it("conflicts when both branches change the same artifact", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "structural/roof", "#ff0000");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof red").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "structural/roof", "#0000ff");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof blue").repo;
    const outcome = merge(repo, "feature");
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]?.kind).toBe("both-modified");
    expect(outcome.repo.merge).not.toBeNull();
    const status = getStatus(outcome.repo);
    const entry = status.entries.find((entry) => entry.path === "structural/roof");
    expect(entry?.worktree).toBe("conflict");
    expect(status.merging).toBe(true);
  });

  it("resolves conflicts and completes the merge commit", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "structural/roof", "#ff0000");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof red").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "structural/roof", "#0000ff");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof blue").repo;
    const outcome = merge(repo, "feature");
    repo = resolveConflict(outcome.repo, "structural/roof", "theirs");
    expect(repo.merge?.conflicts).toHaveLength(0);
    const done = commit(repo, {});
    expect(done.commit.parents).toHaveLength(2);
    expect(done.commit.message).toBe("Merge branch 'feature'");
    expect(done.commit.tree["structural/roof"].color).toBe("#ff0000");
    expect(getStatus(done.repo).clean).toBe(true);
  });

  it("refuses to commit a merge with unresolved conflicts", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "structural/roof", "#ff0000");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof red").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "structural/roof", "#0000ff");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof blue").repo;
    repo = merge(repo, "feature").repo;
    expect(() => commit(repo, { message: "broken" })).toThrow(/unmerged/);
  });

  it("aborts a conflicted merge restoring the pre-merge state", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "structural/roof", "#ff0000");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof red").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "structural/roof", "#0000ff");
    repo = stageAndCommit(repo, "structural/roof", "Paint roof blue").repo;
    const mainTip = repo.branches["main"];
    const outcome = merge(repo, "feature");
    const restored = abortMerge(outcome.repo);
    expect(restored.merge).toBeNull();
    expect(getStatus(restored).clean).toBe(true);
    expect(restored.branches["main"]).toBe(mainTip);
    expect(restored.working["structural/roof"].color).toBe("#0000ff");
  });

  it("flags modify-delete conflicts", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = removeWorkingArtifact(repo, "lowerdeck/sofa");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Remove sofa").repo;
    repo = checkout(repo, "main");
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#ffcc00");
    repo = stageAndCommit(repo, "lowerdeck/sofa", "Recolor sofa").repo;
    const outcome = merge(repo, "feature");
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]?.kind).toBe("modify-delete");
    expect(outcome.conflicts[0]?.ours).not.toBeNull();
    expect(outcome.conflicts[0]?.theirs).toBeNull();
  });

  it("refuses to merge with a dirty working tree", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stageAndCommit(repo, "lowerdeck/table", "Move table").repo;
    repo = checkout(repo, "main");
    repo = moveArtifact(repo, "lowerdeck/table", [9, 0.4, 0]);
    expect(() => merge(repo, "feature")).toThrow(/local changes/);
  });
});
