import { describe, expect, it } from "vitest";
import {
  diffRefs,
  getStatus,
  lsFiles,
  lsTree,
  logQuery,
  showCommit,
} from "./queries";
import { checkout, createBranch } from "./ops-history";
import { stage } from "./ops-worktree";
import { push } from "./ops-remote";
import { createInitialRepository, headCommit } from "./repo";
import {
  addNewArtifact,
  moveArtifact,
  recolorArtifact,
  stageAndCommit,
} from "./test-support";

describe("status", () => {
  it("reports the branch and cleanliness", () => {
    const status = getStatus(createInitialRepository());
    expect(status.branch).toBe("main");
    expect(status.clean).toBe(true);
    expect(status.entries).toEqual([]);
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.merging).toBe(false);
    expect(status.rebasing).toBe(false);
  });

  it("reports staged vs worktree columns per path", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stage(repo, "middledeck/table");
    repo = recolorArtifact(repo, "middledeck/sofa", "#111111");
    repo = addNewArtifact(repo, "middledeck/rug");
    const status = getStatus(repo);
    const table = status.entries.find((entry) => entry.path === "middledeck/table");
    expect(table?.staged).toBe("modified");
    expect(table?.worktree).toBeNull();
    const sofa = status.entries.find((entry) => entry.path === "middledeck/sofa");
    expect(sofa?.staged).toBeNull();
    expect(sofa?.worktree).toBe("modified");
    const rug = status.entries.find((entry) => entry.path === "middledeck/rug");
    expect(rug?.staged).toBeNull();
    expect(rug?.worktree).toBe("untracked");
  });

  it("counts ahead commits after a push then a local commit", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    const status = getStatus(repo);
    expect(status.ahead).toBe(1);
    expect(status.behind).toBe(0);
  });
});

describe("log", () => {
  it("supports origin/main..main ranges", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    const range = logQuery(repo, { revs: ["main"], exclude: ["origin/main"] });
    expect(range.map((c) => c.message)).toEqual(["Move table"]);
  });

  it("supports --all and path filtering", () => {
    let repo = createInitialRepository();
    repo = createBranch(repo, "feature");
    repo = checkout(repo, "feature");
    repo = recolorArtifact(repo, "middledeck/tv", "#222222");
    repo = stageAndCommit(repo, "middledeck/tv", "Recolor tv").repo;
    repo = checkout(repo, "main");
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    const all = logQuery(repo, { all: true });
    expect(all.map((c) => c.message)).toEqual(
      expect.arrayContaining(["Recolor tv", "Move table", "Initial house"]),
    );
    const tableOnly = logQuery(repo, { all: true, path: "middledeck/table" });
    expect(tableOnly.map((c) => c.message)).toEqual(["Move table", "Initial house"]);
  });

  it("orders newest first", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stageAndCommit(repo, "middledeck/table", "Move table").repo;
    repo = recolorArtifact(repo, "middledeck/sofa", "#111111");
    repo = stageAndCommit(repo, "middledeck/sofa", "Recolor sofa").repo;
    const stamps = logQuery(repo, {}).map((c) => c.timestamp);
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });
});

describe("diff", () => {
  it("reports field-level changes", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    const entries = diffRefs(repo, "HEAD", "working");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.fields).toEqual(["position"]);
  });

  it("diffs the index against HEAD and the working tree against the index", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "middledeck/table", [5, 3.4, 0]);
    repo = stage(repo, "middledeck/table");
    expect(diffRefs(repo, "HEAD", "index")).toHaveLength(1);
    expect(diffRefs(repo, "index", "working")).toHaveLength(0);
  });
});

describe("ls-files and ls-tree", () => {
  it("lists index paths", () => {
    const repo = createInitialRepository();
    const files = lsFiles(repo);
    expect(files).toContain("middledeck/table");
    expect(files).toContain("structural/roof");
    expect(files).toHaveLength(21);
  });

  it("lists commit trees with kinds", () => {
    const repo = createInitialRepository();
    const entries = lsTree(repo, "HEAD");
    expect(entries.find((entry) => entry.path === "middledeck")?.kind).toBe("component");
    expect(entries.find((entry) => entry.path === "middledeck/table")?.kind).toBe("artifact");
  });

  it("lists a subtree filtered by path", () => {
    const repo = createInitialRepository();
    const entries = lsTree(repo, "HEAD", "lowerdeck");
    expect(entries.map((entry) => entry.path)).toEqual([
      "lowerdeck",
      "lowerdeck/bathtub",
      "lowerdeck/sink",
      "lowerdeck/toilet",
    ]);
  });
});

describe("show", () => {
  it("shows a commit stat against its parent", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "structural/roof", "#00ff00");
    const done = stageAndCommit(repo, "structural/roof", "Paint roof green");
    const shown = showCommit(done.repo, done.commit.id);
    expect(shown.commit.message).toBe("Paint roof green");
    expect(shown.stat).toHaveLength(1);
    expect(shown.stat[0]?.fields).toEqual(["color"]);
  });

  it("shows the root commit as fully added", () => {
    const repo = createInitialRepository();
    const root = headCommit(repo);
    const shown = showCommit(repo, root.id);
    expect(shown.stat.length).toBeGreaterThan(0);
    expect(shown.stat.every((entry) => entry.before === null)).toBe(true);
  });
});
