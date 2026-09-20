import { describe, expect, it } from "vitest";
import { commit, reset } from "./ops-history";
import { stage } from "./ops-worktree";
import { createInitialRepository, headCommit } from "./repo";
import { getStatus } from "./queries";
import { moveArtifact, recolorArtifact, stageAndCommit } from "./test-support";

describe("commit", () => {
  it("records staged changes and keeps the working tree", () => {
    let repo = createInitialRepository();
    const before = headCommit(repo).id;
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    const result = stageAndCommit(repo, "middledeck/table", "Move table");
    expect(result.commit.parents).toEqual([before]);
    expect(result.commit.message).toBe("Move table");
    expect(result.commit.tree["middledeck/table"].transform.position).toEqual([5, 3.4, 0]);
    expect(result.repo.branches["main"]).toBe(result.commit.id);
    expect(getStatus(result.repo).clean).toBe(true);
    expect(result.repo.working["middledeck/table"].transform.position).toEqual([5, 3.4, 0]);
  });

  it("refuses to commit a clean tree", () => {
    const repo = createInitialRepository();
    expect(() => commit(repo, { message: "nope" })).toThrow(/nothing to commit/);
  });

  it("refuses to commit when changes are only unstaged", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    expect(() => commit(repo, { message: "nope" })).toThrow(/no changes added to commit/);
  });

  it("requires a message for plain commits", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stage(repo, "middledeck/table");
    expect(() => commit(repo, {})).toThrow(/no commit message/);
  });

  it("amend with a new message replaces the tip", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    const first = stageAndCommit(repo, "middledeck/table", "Move table");
    repo = first.repo;
    const amended = commit(repo, { amend: true, message: "Move table properly" });
    expect(amended.commit.message).toBe("Move table properly");
    expect(amended.commit.parents).toEqual(first.commit.parents);
    expect(amended.commit.id).not.toBe(first.commit.id);
    expect(amended.repo.branches["main"]).toBe(amended.commit.id);
  });

  it("amend without a message keeps the old one", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    repo = moveArtifact(repo, "middledeck/table", [7, 3.4, 0]);
    repo = stage(repo, "middledeck/table");
    const amended = commit(repo, { amend: true });
    expect(amended.commit.message).toBe("Move table");
    expect(amended.commit.tree["middledeck/table"].transform.position).toEqual([7, 3.4, 0]);
  });

  it("refuses an amend that would become empty", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    expect(() => commit(repo, { amend: true })).toThrow(/would make it empty/);
  });
});

describe("reset", () => {
  it("soft moves the tip and keeps staged changes", () => {
    let repo = createInitialRepository();
    const initial = headCommit(repo).id;
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    repo = reset(repo, { mode: "soft", revision: "HEAD~1" });
    expect(repo.branches["main"]).toBe(initial);
    const entry = getStatus(repo).entries.find((entry) => entry.path === "middledeck/table");
    expect(entry?.staged).toBe("modified");
  });

  it("mixed moves the tip and resets the index but keeps working changes", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    repo = reset(repo, { mode: "mixed", revision: "HEAD~1" });
    const entry = getStatus(repo).entries.find((entry) => entry.path === "middledeck/table");
    expect(entry?.staged).toBeNull();
    expect(entry?.worktree).toBe("modified");
  });

  it("hard discards staged and working changes", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    repo = moveArtifact(repo, "middledeck/table", [7, 3.4, 0]);
    repo = stage(repo, "middledeck/table");
    repo = recolorArtifact(repo, "middledeck/sofa", "#111111");
    repo = reset(repo, { mode: "hard" });
    expect(getStatus(repo).clean).toBe(true);
    expect(repo.working["middledeck/table"].transform.position).toEqual([5, 3.4, 0]);
    expect(repo.working["middledeck/sofa"].color).toBe("#7d9d6a");
  });

  it("hard rewinds two commits", () => {
    let repo = createInitialRepository();
    const initial = headCommit(repo).id;
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    repo = recolorArtifact(repo, "middledeck/sofa", "#111111");
    repo = stageAndCommit(repo, "middledeck/sofa", "Recolor sofa").repo;
    repo = reset(repo, { mode: "hard", revision: "HEAD~2" });
    expect(repo.branches["main"]).toBe(initial);
    expect(getStatus(repo).clean).toBe(true);
    expect(repo.working["middledeck/table"].transform.position).toEqual([0, 3.4, 0]);
  });
});
