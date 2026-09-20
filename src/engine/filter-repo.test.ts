import { describe, expect, it } from "vitest";
import { purgePath } from "./ops-rewrite";
import { createInitialRepository } from "./repo";
import { getStatus, logQuery } from "./queries";
import { pathExistsInTree } from "./trees";
import { commit } from "./ops-history";
import { stage } from "./ops-worktree";
import { addNewArtifact, moveArtifact, recolorArtifact, stageAndCommit } from "./test-support";

describe("filter-repo (purge path)", () => {
  it("removes the path from every commit and prunes emptied commits", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "middledeck/rug", "#ff00ff");
    repo = stageAndCommit(repo, "middledeck/rug", "Add rug").repo;
    repo = recolorArtifact(repo, "middledeck/rug", "#00ffff");
    repo = stageAndCommit(repo, "middledeck/rug", "Recolor rug").repo;
    const result = purgePath(repo, "middledeck/rug");
    expect(result.rewritten).toBeGreaterThanOrEqual(2);
    for (const commit of Object.values(result.repo.commits)) {
      expect(pathExistsInTree(commit.tree, "middledeck/rug")).toBe(false);
    }
    const messages = logQuery(result.repo, {}).map((c) => c.message);
    expect(messages).toEqual(["Initial house"]);
    expect(getStatus(result.repo).clean).toBe(true);
    expect(result.repo.working["middledeck/rug"]).toBeUndefined();
  });

  it("keeps commits that still change other artifacts", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "middledeck/rug");
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stage(repo, "middledeck/rug");
    repo = stage(repo, "middledeck/table");
    repo = commit(repo, { message: "Rug and table" }).repo;
    const result = purgePath(repo, "middledeck/rug");
    const messages = logQuery(result.repo, {}).map((c) => c.message);
    expect(messages).toContain("Rug and table");
    const kept = logQuery(result.repo, {}).find((c) => c.message === "Rug and table");
    expect(kept?.tree["middledeck/table"].transform.position).toEqual([5, 3.4, 0]);
    expect(kept?.tree["middledeck/rug"]).toBeUndefined();
  });

  it("clears remote tracking so future pushes must be forced", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "middledeck/rug");
    repo = stageAndCommit(repo, "middledeck/rug", "Add rug").repo;
    const result = purgePath(repo, "middledeck/rug");
    expect(result.repo.remoteTracking).toEqual({});
  });

  it("requires a clean working tree", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "middledeck/rug");
    repo = stageAndCommit(repo, "middledeck/rug", "Add rug").repo;
    repo = recolorArtifact(repo, "middledeck/rug", "#00ffff");
    expect(() => purgePath(repo, "middledeck/rug")).toThrow(/clean working tree/);
  });

  it("errors when no history matches the path", () => {
    const repo = createInitialRepository();
    expect(() => purgePath(repo, "middledeck/ghost")).toThrow(/no history/);
  });
});
