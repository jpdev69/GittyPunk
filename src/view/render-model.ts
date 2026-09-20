import { housePaths } from "../engine";
import type { Artifact, ArtifactKind, House, Vec3 } from "../engine";

export type GeometryKind =
  | "deck"
  | "attic"
  | "container"
  | "walls"
  | "roof"
  | "stairs"
  | "windows"
  | "table"
  | "chair"
  | "sofa"
  | "bed"
  | "lamp"
  | "tv"
  | "toilet"
  | "sink"
  | "bathtub"
  | "box"
  | "plant"
  | "rug"
  | "crate";

export interface RenderItem {
  path: string;
  name: string;
  kind: ArtifactKind;
  geometry: GeometryKind;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
}

const STRUCTURAL_GEOMETRY: Record<string, GeometryKind> = {
  walls: "walls",
  roof: "roof",
  stairs: "stairs",
  windows: "windows",
};

const OBJECT_GEOMETRY: Record<string, GeometryKind> = {
  table: "table",
  chair: "chair",
  sofa: "sofa",
  bed: "bed",
  lamp: "lamp",
  tv: "tv",
  toilet: "toilet",
  sink: "sink",
  bathtub: "bathtub",
  box: "box",
  plant: "plant",
  rug: "rug",
  mat: "rug",
};

export function geometryFor(artifact: Artifact): GeometryKind {
  if (artifact.kind === "component") {
    if (artifact.name === "structural") return "container";
    if (artifact.name === "attic") return "attic";
    return "deck";
  }
  return (
    STRUCTURAL_GEOMETRY[artifact.name] ??
    OBJECT_GEOMETRY[artifact.name] ??
    "crate"
  );
}

export function toRenderItem(path: string, artifact: Artifact): RenderItem {
  return {
    path,
    name: artifact.name,
    kind: artifact.kind,
    geometry: geometryFor(artifact),
    position: artifact.transform.position,
    rotation: artifact.transform.rotation,
    scale: artifact.transform.scale,
    color: artifact.color,
    visible: artifact.visible,
  };
}

export function buildRenderList(house: House): RenderItem[] {
  return housePaths(house).map((path) =>
    toRenderItem(path, house[path] as Artifact),
  );
}
