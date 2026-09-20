import { describe, expect, it } from "vitest";
import {
  applyOriginUpdate,
  createInitialRepository,
  headCommit,
} from "../engine";
import type { Repository } from "../engine";
import {
  addNewArtifact,
  recolorArtifact,
  stageAndCommit,
} from "../engine/test-support";
import { emptyEnv, executeCommand } from "../parser";
import type { ExecutionEnv } from "../parser";
import { houseStatusParts, summarizeHouseState } from "./artifact-states";

function run(repo: Repository, input: string, env: ExecutionEnv = emptyEnv()) {
  return executeCommand(input, repo, env);
}

function runOk(repo: Repository, input: string) {
  const result = run(repo, input);
  expect(
    result.error,
    `command failed: ${input}\n${result.output.join("\n")}`,
  ).toBe(false);
  return result.repo;
}

describe("remote sync (Phase 6)", () => {
  it("pushes local commits to origin and updates remote tracking", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push"); // Establish tracking on origin

    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#123456"),
      "lowerdeck/sofa",
      "Recolor sofa",
    ).repo;

    const summaryBefore = summarizeHouseState(repo);
    expect(summaryBefore.ahead).toBe(1);

    const result = run(repo, "git push");
    expect(result.error).toBe(false);
    expect(result.output.join("\n")).toContain("main -> main");

    const summaryAfter = summarizeHouseState(result.repo);
    expect(summaryAfter.ahead).toBe(0);
    expect(result.repo.remoteTracking["origin/main"]).toBe(
      headCommit(result.repo).id,
    );
    expect(result.repo.origin.branches["main"]).toBe(
      headCommit(result.repo).id,
    );
  });

  it("rejects non-fast-forward push with git-accurate error text", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push");

    let colleague = createInitialRepository();
    colleague = runOk(colleague, "git push");
    colleague = stageAndCommit(
      recolorArtifact(colleague, "lowerdeck/sofa", "#222222"),
      "lowerdeck/sofa",
      "Colleague sofa",
    ).repo;
    colleague = runOk(colleague, "git push");

    // Local changes sofa independently
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Local sofa",
    ).repo;
    repo = applyOriginUpdate(repo, colleague.origin);

    const pushed = run(repo, "git push");
    expect(pushed.error).toBe(true);
    const output = pushed.output.join("\n");
    expect(output).toContain("non-fast-forward");
    expect(output).toContain("failed to push some refs");
  });

  it("enforces force-with-lease lease checks against stale origin state", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push");

    let colleague = createInitialRepository();
    colleague = runOk(colleague, "git push");
    colleague = stageAndCommit(
      recolorArtifact(colleague, "lowerdeck/sofa", "#222222"),
      "lowerdeck/sofa",
      "Colleague sofa",
    ).repo;
    colleague = runOk(colleague, "git push");

    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Local sofa",
    ).repo;
    repo = applyOriginUpdate(repo, colleague.origin);

    // force-with-lease fails because local remoteTracking is stale
    const rejected = run(repo, "git push --force-with-lease");
    expect(rejected.error).toBe(true);
    expect(rejected.output.join("\n")).toContain("stale info");

    // After fetch, remoteTracking updates to colleague's tip, so force-with-lease succeeds
    repo = runOk(repo, "git fetch");
    const forced = run(repo, "git push --force-with-lease");
    expect(forced.error).toBe(false);
    expect(forced.repo.origin.branches["main"]).toBe(headCommit(forced.repo).id);
  });

  it("fetches updates and identifies unfetched origin commits", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push");

    // Colleague pushes a commit to origin
    let colleague = createInitialRepository();
    colleague = runOk(colleague, "git push");
    colleague = stageAndCommit(
      addNewArtifact(colleague, "lowerdeck/rug"),
      "lowerdeck/rug",
      "Add rug on origin",
    ).repo;
    colleague = runOk(colleague, "git push");
    repo = applyOriginUpdate(repo, colleague.origin);

    const summaryBefore = summarizeHouseState(repo);
    expect(summaryBefore.unfetched).toBe(true);
    expect(houseStatusParts(summaryBefore)).toEqual([
      { kind: "clean", text: "working tree clean" },
    ]);

    repo = runOk(repo, "git fetch");
    const summaryAfter = summarizeHouseState(repo);
    expect(summaryAfter.unfetched).toBe(false);
    expect(summaryAfter.behind).toBe(1);
  });

  it("pulls remote changes and handles merge conflicts round-trip", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push");

    // Colleague pushes a conflicting sofa color to origin
    let colleague = createInitialRepository();
    colleague = runOk(colleague, "git push");
    colleague = stageAndCommit(
      recolorArtifact(colleague, "lowerdeck/sofa", "#990000"),
      "lowerdeck/sofa",
      "Colleague red sofa",
    ).repo;
    colleague = runOk(colleague, "git push");
    repo = applyOriginUpdate(repo, colleague.origin);

    // Local changes sofa to blue
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#000099"),
      "lowerdeck/sofa",
      "Local blue sofa",
    ).repo;

    const pulled = run(repo, "git pull");
    expect(pulled.error).toBe(false); // merge in progress returns error: false in parser
    expect(pulled.output.join("\n")).toContain("CONFLICT (content)");

    // Resolve conflict with --ours
    repo = runOk(pulled.repo, "git checkout --ours lowerdeck/sofa");
    repo = runOk(repo, 'git commit -m "Resolved sofa conflict"');
    expect(repo.merge).toBeNull();

    // Push the resolved merge commit back to origin
    repo = runOk(repo, "git push");
    expect(repo.origin.branches["main"]).toBe(headCommit(repo).id);
  });

  it("creates and clones bundles restoring an identical house", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug", "#ff00ff"),
      "lowerdeck/rug",
      "Add rug",
    ).repo;

    const env: ExecutionEnv = emptyEnv();
    const bundled = run(repo, "git bundle create house.bundle", env);
    expect(bundled.error).toBe(false);
    expect(bundled.env.bundles["house.bundle"]).toBeDefined();

    const cloned = run(createInitialRepository(), "git clone house.bundle", bundled.env);
    expect(cloned.error).toBe(false);
    expect(cloned.repo.working["lowerdeck/rug"]).toBeDefined();
    expect(cloned.repo.working["lowerdeck/rug"]?.color).toBe("#ff00ff");
  });
});
