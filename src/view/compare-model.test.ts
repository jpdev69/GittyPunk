import { describe, expect, it } from "vitest";
import {
  createInitialRepository,
  removeTracked,
  stage,
  upsertArtifact,
} from "../engine";
import type { Repository } from "../engine";
import {
  addNewArtifact,
  hideArtifact,
  moveArtifact,
  recolorArtifact,
  rotateArtifact,
  stageAndCommit,
} from "../engine/test-support";
import { compareChanges } from "./compare-model";

function scenarioRepo(): Repository {
  let repo = createInitialRepository();
  repo = moveArtifact(repo, "middledeck/table", [2, 3.4, 1]);
  repo = rotateArtifact(repo, "middledeck/sofa", [0, Math.PI / 6, 0]);
  repo = recolorArtifact(repo, "middledeck/tv", "#40e0d0");
  repo = hideArtifact(repo, "upperdeck/bed");
  const box = repo.working["attic/box"];
  if (!box) throw new Error("test setup: missing attic/box");
  repo = upsertArtifact(repo, {
    ...box,
    transform: { ...box.transform, scale: [2, 2, 2] },
  });
  repo = addNewArtifact(repo, "middledeck/rug");
  repo = removeTracked(repo, "upperdeck/lamp", { cached: false });
  repo = stage(repo, "middledeck/table");
  repo = stage(repo, "middledeck/sofa");
  repo = stage(repo, "middledeck/tv");
  repo = stage(repo, "upperdeck/bed");
  repo = stage(repo, "attic/box");
  repo = stage(repo, "middledeck/rug");
  return stageAndCommit(repo, "middledeck/rug", "Rearrange").repo;
}

describe("compareChanges", () => {
  it("classifies every delta kind the engine diff reports", () => {
    const repo = scenarioRepo();
    const changes = compareChanges(repo, "HEAD~1", "HEAD");
    const byPath = Object.fromEntries(
      changes.map((change) => [change.path, change]),
    );

    expect(byPath["middledeck/table"]).toMatchObject({
      added: false,
      removed: false,
      moved: true,
      rotated: false,
      recolored: false,
      rescaled: false,
      retoggled: false,
    });
    expect(byPath["middledeck/table"]?.fromPosition).toEqual([0, 3.4, 0]);
    expect(byPath["middledeck/sofa"]?.rotated).toBe(true);
    expect(byPath["middledeck/tv"]?.recolored).toBe(true);
    expect(byPath["upperdeck/bed"]?.retoggled).toBe(true);
    expect(byPath["attic/box"]?.rescaled).toBe(true);
    expect(byPath["middledeck/rug"]).toMatchObject({
      added: true,
      removed: false,
      moved: false,
      fromPosition: null,
    });
    expect(byPath["middledeck/rug"]?.before).toBeNull();
    expect(byPath["middledeck/rug"]?.after).not.toBeNull();
    expect(byPath["upperdeck/lamp"]).toMatchObject({
      added: false,
      removed: true,
      before: expect.anything(),
      after: null,
    });
    expect(changes).toHaveLength(7);
  });

  it("resolves working and index refs like git diff does", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "middledeck/sofa", "#123456");
    const unstaged = compareChanges(repo, "index", "working");
    expect(unstaged).toHaveLength(1);
    expect(unstaged[0]?.path).toBe("middledeck/sofa");
    expect(unstaged[0]?.recolored).toBe(true);

    repo = stage(repo, "middledeck/sofa");
    const staged = compareChanges(repo, "HEAD", "index");
    expect(staged).toHaveLength(1);
    expect(staged[0]?.recolored).toBe(true);

    expect(compareChanges(createInitialRepository(), "HEAD", "working")).toHaveLength(0);
  });
});
