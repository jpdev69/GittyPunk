import { describe, expect, it } from "vitest";
import {
  createInitialRepository,
  removeTracked,
  removeWorkingArtifact,
  stage,
} from "../engine";
import type { Repository, StagedChange } from "../engine";
import { addNewArtifact, recolorArtifact, stageAndCommit } from "../engine/test-support";
import { emptyEnv, executeCommand } from "../parser";
import type { ExecutionEnv } from "../parser";
import {
  computeVisualStates,
  houseStatusParts,
  summarizeHouseState,
} from "./artifact-states";

function run(repo: Repository, input: string, env: ExecutionEnv = emptyEnv()) {
  return executeCommand(input, repo, env);
}

function runOk(repo: Repository, input: string): Repository {
  const result = run(repo, input);
  expect(
    result.error,
    `command failed: ${input}\n${result.output.join("\n")}`,
  ).toBe(false);
  return result.repo;
}

function scenarioRepo(): Repository {
  let repo = createInitialRepository();
  repo = stage(
    recolorArtifact(repo, "middledeck/chair", "#4060ff"),
    "middledeck/chair",
  );
  repo = recolorArtifact(repo, "middledeck/chair", "#80a0ff");
  repo = recolorArtifact(repo, "middledeck/sofa", "#305070");
  repo = addNewArtifact(repo, "middledeck/rug");
  repo = removeTracked(repo, "middledeck/table", { cached: false });
  repo = removeWorkingArtifact(repo, "upperdeck/lamp");
  return repo;
}

describe("computeVisualStates", () => {
  it("matches git status --short exactly", () => {
    const repo = scenarioRepo();
    const status = run(repo, "git status --short");
    expect(status.error).toBe(false);
    expect(status.output).toEqual([
      "MM middledeck/chair",
      "?? middledeck/rug",
      " M middledeck/sofa",
      "D  middledeck/table",
      " D upperdeck/lamp",
    ]);

    const states = computeVisualStates(repo);
    const paths = status.output.map((line) => line.slice(3));
    expect(Object.keys(states).sort()).toEqual([...paths].sort());

    const stagedByCode: Record<string, StagedChange> = {
      M: "modified",
      A: "added",
      D: "removed",
      " ": null,
    };
    const unstagedByCode: Record<string, "modified" | "untracked" | null> = {
      M: "modified",
      "?": "untracked",
      U: null,
      D: null,
      A: null,
      " ": null,
    };

    for (const line of status.output) {
      const code = line.slice(0, 2);
      const path = line.slice(3);
      const state = states[path];
      expect(state, `missing visual state for ${path}`).toBeDefined();
      if (code === "??") {
        expect(state.staged).toBeNull();
        expect(state.unstaged).toBe("untracked");
        continue;
      }
      if (code === "UU") {
        expect(state.conflict, `missing conflict for ${path}`).not.toBeNull();
        continue;
      }
      expect(state.staged).toBe(stagedByCode[code[0]]);
      expect(state.unstaged).toBe(unstagedByCode[code[1]]);
      if (code[1] === "U") {
        expect(state.conflict).not.toBeNull();
      }
    }
  });

  it("flags conflicted artifacts from an in-progress merge", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature");
    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#111111"),
      "middledeck/sofa",
      "Feature sofa",
    ).repo;
    repo = runOk(repo, "git checkout main");
    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#222222"),
      "middledeck/sofa",
      "Main sofa",
    ).repo;
    const conflicted = run(repo, "git merge feature");
    expect(conflicted.error).toBe(false);
    expect(conflicted.repo.merge).not.toBeNull();

    const status = run(conflicted.repo, "git status --short");
    expect(status.output).toEqual(["UU middledeck/sofa"]);

    const states = computeVisualStates(conflicted.repo);
    const state = states["middledeck/sofa"];
    expect(state.conflict?.kind).toBe("both-modified");
    expect(state.conflict?.theirs?.color).toBe("#111111");
    expect(state.unstaged).toBeNull();

    const summary = summarizeHouseState(conflicted.repo);
    expect(summary.conflicts).toBe(1);
    expect(summary.merging).toBe(true);
    expect(summary.clean).toBe(false);
  });
});

describe("summarizeHouseState", () => {
  it("counts each change kind in git status terms", () => {
    const summary = summarizeHouseState(scenarioRepo());
    expect(summary).toMatchObject({
      branch: "main",
      detached: false,
      modified: 2,
      staged: 1,
      removals: 1,
      untracked: 1,
      conflicts: 0,
      merging: false,
      rebasing: false,
      clean: false,
    });
    expect(summary.head).toHaveLength(7);
  });

  it("reports a clean house when nothing differs from HEAD", () => {
    const summary = summarizeHouseState(createInitialRepository());
    expect(summary.clean).toBe(true);
    expect(summary.modified).toBe(0);
    expect(summary.staged).toBe(0);
    expect(summary.removals).toBe(0);
    expect(summary.untracked).toBe(0);
    expect(summary.conflicts).toBe(0);
  });
});

describe("houseStatusParts", () => {
  it("builds status bar parts mirroring git status", () => {
    const parts = houseStatusParts(summarizeHouseState(scenarioRepo()));
    expect(parts).toEqual([
      { kind: "modified", text: "2 modified" },
      { kind: "staged", text: "1 staged" },
      { kind: "removal", text: "1 staged for removal" },
      { kind: "untracked", text: "1 untracked" },
    ]);
  });

  it("reports a clean part when the house matches HEAD", () => {
    const parts = houseStatusParts(summarizeHouseState(createInitialRepository()));
    expect(parts).toEqual([{ kind: "clean", text: "working tree clean" }]);
  });
});
