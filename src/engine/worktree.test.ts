import { describe, expect, it } from "vitest";
import {
  removeTracked,
  removeWorkingArtifact,
  restoreWorking,
  stage,
  stageAll,
  unstage,
} from "./ops-worktree";
import { getStatus } from "./queries";
import { createInitialRepository } from "./repo";
import { addNewArtifact, moveArtifact, recolorArtifact } from "./test-support";

describe("untracked artifacts", () => {
  it("shows new working artifacts as untracked", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "middledeck/rug");
    const status = getStatus(repo);
    const rug = status.entries.find((entry) => entry.path === "middledeck/rug");
    expect(rug?.worktree).toBe("untracked");
    expect(rug?.staged).toBeNull();
    expect(status.clean).toBe(false);
  });
});

describe("git add semantics", () => {
  it("stages modifications", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    let status = getStatus(repo);
    expect(status.entries[0]?.worktree).toBe("modified");
    repo = stage(repo, "middledeck/table");
    status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "middledeck/table");
    expect(entry?.staged).toBe("modified");
    expect(entry?.worktree).toBeNull();
  });

  it("stages every artifact under a component prefix", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = recolorArtifact(repo, "middledeck/sofa", "#123456");
    repo = stage(repo, "middledeck");
    const status = getStatus(repo);
    expect(status.entries).toHaveLength(2);
    for (const entry of status.entries) {
      expect(entry.staged).toBe("modified");
    }
  });

  it("stages deletions for paths deleted from the working tree", () => {
    let repo = createInitialRepository();
    repo = removeWorkingArtifact(repo, "middledeck/chair");
    repo = stage(repo, "middledeck/chair");
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "middledeck/chair");
    expect(entry?.staged).toBe("removed");
    expect(entry?.worktree).toBeNull();
  });

  it("rejects unknown pathspecs", () => {
    const repo = createInitialRepository();
    expect(() => stage(repo, "attic/ghost")).toThrow(/did not match any files/);
  });
});

describe("git rm semantics", () => {
  it("removes from both working tree and index", () => {
    let repo = createInitialRepository();
    repo = removeTracked(repo, "middledeck/sofa", { cached: false });
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "middledeck/sofa");
    expect(entry?.staged).toBe("removed");
    expect(repo.working["middledeck/sofa"]).toBeUndefined();
  });

  it("rm --cached keeps the working copy but stages the deletion", () => {
    let repo = createInitialRepository();
    repo = removeTracked(repo, "middledeck/sofa", { cached: true });
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "middledeck/sofa");
    expect(entry?.staged).toBe("removed");
    expect(entry?.worktree).toBe("untracked");
    expect(repo.working["middledeck/sofa"]).toBeDefined();
  });

  it("removes a whole component with its descendants", () => {
    let repo = createInitialRepository();
    repo = removeTracked(repo, "attic", { cached: false });
    expect(repo.working["attic"]).toBeUndefined();
    expect(repo.working["attic/box"]).toBeUndefined();
    const status = getStatus(repo);
    expect(status.entries.map((entry) => entry.path)).toEqual(["attic", "attic/box"]);
    for (const entry of status.entries) {
      expect(entry.staged).toBe("removed");
    }
  });
});

describe("unstage and restore", () => {
  it("unstage returns the index to HEAD", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stage(repo, "middledeck/table");
    repo = unstage(repo, "middledeck/table");
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "middledeck/table");
    expect(entry?.staged).toBeNull();
    expect(entry?.worktree).toBe("modified");
  });

  it("unstage removes a newly added artifact from the index", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "middledeck/rug");
    repo = stage(repo, "middledeck/rug");
    repo = unstage(repo, "middledeck/rug");
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "middledeck/rug");
    expect(entry?.staged).toBeNull();
    expect(entry?.worktree).toBe("untracked");
  });

  it("restoreWorking reverts the working tree to the index version", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = restoreWorking(repo, "middledeck/table");
    expect(getStatus(repo).clean).toBe(true);
  });

  it("stageAll stages every working change", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = addNewArtifact(repo, "middledeck/rug");
    repo = stageAll(repo);
    const status = getStatus(repo);
    const table = status.entries.find((entry) => entry.path === "middledeck/table");
    const rug = status.entries.find((entry) => entry.path === "middledeck/rug");
    expect(table?.staged).toBe("modified");
    expect(rug?.staged).toBe("added");
  });
});
