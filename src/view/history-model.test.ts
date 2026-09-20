import { describe, expect, it } from "vitest";
import { createInitialRepository } from "../engine";
import type { Repository } from "../engine";
import { addNewArtifact, moveArtifact, recolorArtifact, stageAndCommit } from "../engine/test-support";
import { emptyEnv, executeCommand } from "../parser";
import type { ExecutionEnv } from "../parser";
import { historyEntries } from "./history-model";

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

describe("historyEntries", () => {
  it("lists every commit newest first with tips, HEAD, and unpushed marks", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      moveArtifact(repo, "middledeck/table", [5, 3.4, 0]),
      "middledeck/table",
      "Move table",
    ).repo;
    repo = runOk(repo, "git push");
    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#111111"),
      "middledeck/sofa",
      "Recolor sofa",
    ).repo;
    repo = runOk(repo, "git checkout -b feature");
    repo = stageAndCommit(
      addNewArtifact(repo, "middledeck/rug"),
      "middledeck/rug",
      "Feature rug",
    ).repo;

    const entries = historyEntries(repo);
    expect(entries.map((entry) => entry.message)).toEqual([
      "Feature rug",
      "Recolor sofa",
      "Move table",
      "Initial house",
    ]);
    expect(entries.map((entry) => entry.isHead)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(entries.map((entry) => entry.unpushed)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(entries[0]?.tips).toEqual(["feature"]);
    expect(entries[1]?.tips).toEqual(["main"]);
    expect(entries[2]?.tips).toEqual(["origin/main"]);
    expect(entries[3]?.tips).toEqual([]);
    expect(entries[0]?.shortId).toHaveLength(7);
  });

  it("marks unpushed only when the remote tracks the current branch", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#111111"),
      "middledeck/sofa",
      "Recolor sofa",
    ).repo;
    const beforePush = historyEntries(repo);
    expect(beforePush[0]?.unpushed).toBe(false);

    repo = runOk(repo, "git push");
    const afterPush = historyEntries(repo);
    expect(afterPush[0]?.unpushed).toBe(false);
    expect(afterPush[0]?.tips).toContain("origin/main");

    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#222222"),
      "middledeck/sofa",
      "Recolor again",
    ).repo;
    const ahead = historyEntries(repo);
    expect(ahead[0]?.unpushed).toBe(true);
    expect(ahead[1]?.unpushed).toBe(false);
  });

  it("keeps working from a detached HEAD", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      moveArtifact(repo, "middledeck/table", [5, 3.4, 0]),
      "middledeck/table",
      "Move table",
    ).repo;
    const initialId = Object.values(repo.commits).find(
      (commit) => commit.message === "Initial house",
    )?.id;
    repo = runOk(repo, `git checkout ${initialId ?? ""}`);
    const entries = historyEntries(repo);
    expect(entries.map((entry) => entry.message)).toEqual([
      "Move table",
      "Initial house",
    ]);
    expect(entries[1]?.isHead).toBe(true);
    expect(entries.every((entry) => !entry.unpushed)).toBe(true);
  });
});
