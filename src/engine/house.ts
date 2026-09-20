import { GitError } from "./types";
import type { Artifact, ArtifactKind, House, Transform, Vec3 } from "./types";

export const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export function parentOfPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index === -1 ? null : path.slice(0, index);
}

export function nameOfPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

export function makeArtifact(path: string, options: Partial<Artifact> = {}): Artifact {
  const trimmed = path.trim();
  const segments = trimmed.split("/");
  const invalid =
    !trimmed ||
    trimmed.startsWith("/") ||
    trimmed.endsWith("/") ||
    trimmed.includes("//") ||
    segments.includes("..") ||
    segments.includes(".");
  if (invalid) {
    throw new GitError(`fatal: invalid artifact path '${path}'`);
  }
  return {
    id: trimmed,
    name: options.name ?? nameOfPath(trimmed),
    kind: options.kind ?? "artifact",
    parent: options.parent ?? parentOfPath(trimmed),
    transform: options.transform ?? { ...DEFAULT_TRANSFORM },
    color: options.color ?? "#b0b0b0",
    visible: options.visible ?? true,
  };
}

export function cloneHouse(house: House): House {
  return structuredClone(house);
}

export function pathsUnderPrefix(house: House, path: string): string[] {
  const exact = house[path] ? [path] : [];
  const prefix = path.endsWith("/") ? path : `${path}/`;
  const under = Object.keys(house).filter((candidate) =>
    candidate.startsWith(prefix),
  );
  return [...new Set([...exact, ...under])].sort();
}

interface HouseEntrySpec {
  path: string;
  kind: ArtifactKind;
  color: string;
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  visible?: boolean;
}

const INITIAL_HOUSE: HouseEntrySpec[] = [
  { path: "attic", kind: "component", color: "#8a5a33", position: [0, 12, 0] },
  { path: "attic/box", kind: "artifact", color: "#b3824a", position: [0.5, 12.4, 0] },
  { path: "roofdeck", kind: "component", color: "#7c4f2d", position: [0, 9, 0] },
  { path: "roofdeck/plant", kind: "artifact", color: "#5faa5f", position: [1, 9.4, -1] },
  { path: "upperdeck", kind: "component", color: "#e8c56a", position: [0, 6, 0] },
  { path: "upperdeck/bed", kind: "artifact", color: "#d96a6a", position: [-2, 6.4, -1] },
  { path: "upperdeck/lamp", kind: "artifact", color: "#ffd27d", position: [0, 6.4, -2] },
  { path: "middledeck", kind: "component", color: "#e8c56a", position: [0, 3, 0] },
  { path: "middledeck/table", kind: "artifact", color: "#a9713f", position: [0, 3.4, 0] },
  { path: "middledeck/chair", kind: "artifact", color: "#c58a4e", position: [1, 3.4, 0] },
  { path: "middledeck/sofa", kind: "artifact", color: "#7d9d6a", position: [-1.5, 3.4, 1] },
  { path: "middledeck/tv", kind: "artifact", color: "#3d4654", position: [0, 3.6, 2] },
  { path: "lowerdeck", kind: "component", color: "#e8c56a", position: [0, 0, 0] },
  { path: "lowerdeck/toilet", kind: "artifact", color: "#f4f7fa", position: [1.5, 0.4, 1.5] },
  { path: "lowerdeck/sink", kind: "artifact", color: "#eef4f8", position: [-1.5, 0.4, 1.5] },
  { path: "lowerdeck/bathtub", kind: "artifact", color: "#cfe6f4", position: [-0.5, 0.4, -1.5] },
  { path: "structural", kind: "component", color: "#6e7480", position: [0, 0, 0] },
  { path: "structural/roof", kind: "artifact", color: "#c94f4f", position: [0, 13.5, 0] },
  { path: "structural/walls", kind: "artifact", color: "#f2e3b3", position: [0, 6, 0] },
  { path: "structural/stairs", kind: "artifact", color: "#9c7148", position: [2, 1.5, 2] },
  { path: "structural/windows", kind: "artifact", color: "#bfe3ff", position: [0, 6, 4] },
];

export function buildInitialHouse(): House {
  const house: House = {};
  for (const entry of INITIAL_HOUSE) {
    house[entry.path] = makeArtifact(entry.path, {
      kind: entry.kind,
      color: entry.color,
      transform: {
        position: entry.position,
        rotation: entry.rotation ?? [0, 0, 0],
        scale: entry.scale ?? [1, 1, 1],
      },
      visible: entry.visible ?? true,
    });
  }
  return house;
}

export function initialHousePaths(): string[] {
  return INITIAL_HOUSE.map((entry) => entry.path);
}
