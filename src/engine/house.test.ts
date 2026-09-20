import { describe, expect, it } from "vitest";
import { buildInitialHouse, initialHousePaths, makeArtifact, pathsUnderPrefix } from "./house";
import { GitError } from "./types";

describe("initial house", () => {
  const house = buildInitialHouse();

  it("contains every planned path", () => {
    for (const path of initialHousePaths()) {
      expect(house[path]).toBeDefined();
    }
  });

  it("has consistent ids, names, and parents", () => {
    for (const artifact of Object.values(house)) {
      expect(artifact.id.endsWith(artifact.name)).toBe(true);
      const expectedParent = artifact.id.includes("/")
        ? artifact.id.slice(0, artifact.id.lastIndexOf("/"))
        : null;
      expect(artifact.parent).toBe(expectedParent);
      if (artifact.parent) {
        expect(house[artifact.parent]).toBeDefined();
      }
    }
  });

  it("marks decks and the structural container as components", () => {
    for (const path of [
      "attic",
      "roofdeck",
      "upperdeck",
      "middledeck",
      "lowerdeck",
      "structural",
    ]) {
      expect(house[path]?.kind).toBe("component");
    }
  });
});

describe("makeArtifact", () => {
  it("rejects invalid paths", () => {
    expect(() => makeArtifact("/leading")).toThrow(GitError);
    expect(() => makeArtifact("trailing/")).toThrow(GitError);
    expect(() => makeArtifact("double//slash")).toThrow(GitError);
    expect(() => makeArtifact("../escape")).toThrow(GitError);
    expect(() => makeArtifact("")).toThrow(GitError);
  });

  it("derives name and parent from the path", () => {
    const artifact = makeArtifact("middledeck/rug");
    expect(artifact.name).toBe("rug");
    expect(artifact.parent).toBe("middledeck");
    expect(artifact.kind).toBe("artifact");
    expect(artifact.transform.position).toEqual([0, 0, 0]);
    expect(artifact.visible).toBe(true);
  });
});

describe("pathsUnderPrefix", () => {
  it("returns the path itself plus descendants", () => {
    const paths = pathsUnderPrefix(buildInitialHouse(), "middledeck");
    expect(paths).toContain("middledeck");
    expect(paths).toContain("middledeck/table");
    expect(paths).toContain("middledeck/tv");
    expect(paths).not.toContain("upperdeck/bed");
  });

  it("returns nothing for unknown paths", () => {
    expect(pathsUnderPrefix(buildInitialHouse(), "middledeck/ghost")).toEqual([]);
  });
});
