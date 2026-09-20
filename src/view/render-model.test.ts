import { describe, expect, it } from "vitest";
import {
  buildInitialHouse,
  cloneHouse,
  initialHousePaths,
  makeArtifact,
} from "../engine";
import type { Artifact } from "../engine";
import { buildRenderList, geometryFor } from "./render-model";

describe("buildRenderList", () => {
  const house = buildInitialHouse();

  it("renders one item per schema artifact, in schema order", () => {
    const items = buildRenderList(house);
    expect(items).toHaveLength(21);
    expect([...items.map((item) => item.path)].sort()).toEqual(
      [...initialHousePaths()].sort(),
    );
  });

  it("passes the full transform, color, and visibility through", () => {
    const items = buildRenderList(house);
    for (const item of items) {
      const artifact = house[item.path] as Artifact;
      expect(item.position).toBe(artifact.transform.position);
      expect(item.rotation).toBe(artifact.transform.rotation);
      expect(item.scale).toBe(artifact.transform.scale);
      expect(item.color).toBe(artifact.color);
      expect(item.visible).toBe(artifact.visible);
      expect(item.name).toBe(artifact.name);
      expect(item.kind).toBe(artifact.kind);
    }
  });

  it("maps every schema entry to a recognizable geometry", () => {
    const items = buildRenderList(house);
    const kinds = new Map(items.map((item) => [item.path, item.geometry]));
    const expected: Record<string, string> = {
      attic: "attic",
      roofdeck: "deck",
      upperdeck: "deck",
      middledeck: "deck",
      lowerdeck: "deck",
      structural: "container",
      "attic/box": "box",
      "roofdeck/plant": "plant",
      "upperdeck/bed": "bed",
      "upperdeck/lamp": "lamp",
      "middledeck/table": "table",
      "middledeck/chair": "chair",
      "middledeck/sofa": "sofa",
      "middledeck/tv": "tv",
      "lowerdeck/toilet": "toilet",
      "lowerdeck/sink": "sink",
      "lowerdeck/bathtub": "bathtub",
      "structural/roof": "roof",
      "structural/walls": "walls",
      "structural/stairs": "stairs",
      "structural/windows": "windows",
    };
    for (const [path, geometry] of Object.entries(expected)) {
      expect(kinds.get(path), path).toBe(geometry);
    }
  });

  it("drops artifacts that leave the working tree", () => {
    const pruned = cloneHouse(house);
    delete pruned["middledeck/table"];
    const remaining = buildRenderList(pruned);
    expect(remaining).toHaveLength(20);
    expect(remaining.some((item) => item.path === "middledeck/table")).toBe(
      false,
    );
  });

  it("falls back to a crate for unknown artifact names", () => {
    expect(geometryFor(makeArtifact("middledeck/gizmo"))).toBe("crate");
    expect(geometryFor(makeArtifact("middledeck/mat"))).toBe("rug");
  });
});
