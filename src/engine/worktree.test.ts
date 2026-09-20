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
    repo = addNewArtifact(repo, "lowerdeck/rug");
    const status = getStatus(repo);
    const rug = status.entries.find((entry) => entry.path === "lowerdeck/rug");
    expect(rug?.worktree).toBe("untracked");
    expect(rug?.staged).toBeNull();
    expect(status.clean).toBe(false);
  });
});

describe("git add semantics", () => {
  it("stages modifications", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    let status = getStatus(repo);
    expect(status.entries[0]?.worktree).toBe("modified");
    repo = stage(repo, "lowerdeck/table");
    status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/table");
    expect(entry?.staged).toBe("modified");
    expect(entry?.worktree).toBeNull();
  });

  it("stages every artifact under a component prefix", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#123456");
    repo = stage(repo, "lowerdeck");
    const status = getStatus(repo);
    expect(status.entries).toHaveLength(2);
    for (const entry of status.entries) {
      expect(entry.staged).toBe("modified");
    }
  });

  it("stages deletions for paths deleted from the working tree", () => {
    let repo = createInitialRepository();
    repo = removeWorkingArtifact(repo, "lowerdeck/chair");
    repo = stage(repo, "lowerdeck/chair");
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/chair");
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
    repo = removeTracked(repo, "lowerdeck/sofa", { cached: false });
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/sofa");
    expect(entry?.staged).toBe("removed");
    expect(repo.working["lowerdeck/sofa"]).toBeUndefined();
  });

  it("rm --cached keeps the working copy but stages the deletion", () => {
    let repo = createInitialRepository();
    repo = removeTracked(repo, "lowerdeck/sofa", { cached: true });
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/sofa");
    expect(entry?.staged).toBe("removed");
    expect(entry?.worktree).toBe("untracked");
    expect(repo.working["lowerdeck/sofa"]).toBeDefined();
  });

  it("removes a whole component with its descendants", () => {
    let repo = createInitialRepository();
    repo = removeTracked(repo, "attic", { cached: false });
    expect(repo.working["attic"]).toBeUndefined();
    expect(repo.working["attic/box"]).toBeUndefined();
    const status = getStatus(repo);
    expect(status.entries.map((entry) => entry.path)).toEqual(["attic", "attic/box", "attic/plant"]);
    for (const entry of status.entries) {
      expect(entry.staged).toBe("removed");
    }
  });
});

describe("unstage and restore", () => {
  it("unstage returns the index to HEAD", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = stage(repo, "lowerdeck/table");
    repo = unstage(repo, "lowerdeck/table");
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/table");
    expect(entry?.staged).toBeNull();
    expect(entry?.worktree).toBe("modified");
  });

  it("unstage removes a newly added artifact from the index", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "lowerdeck/rug");
    repo = stage(repo, "lowerdeck/rug");
    repo = unstage(repo, "lowerdeck/rug");
    const status = getStatus(repo);
    const entry = status.entries.find((entry) => entry.path === "lowerdeck/rug");
    expect(entry?.staged).toBeNull();
    expect(entry?.worktree).toBe("untracked");
  });

  it("restoreWorking reverts the working tree to the index version", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = restoreWorking(repo, "lowerdeck/table");
    expect(getStatus(repo).clean).toBe(true);
  });

  it("stageAll stages every working change", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [5, 0.4, 0]);
    repo = addNewArtifact(repo, "lowerdeck/rug");
    repo = stageAll(repo);
    const status = getStatus(repo);
    const table = status.entries.find((entry) => entry.path === "lowerdeck/table");
    const rug = status.entries.find((entry) => entry.path === "lowerdeck/rug");
    expect(table?.staged).toBe("modified");
    expect(rug?.staged).toBe("added");
  });
});
