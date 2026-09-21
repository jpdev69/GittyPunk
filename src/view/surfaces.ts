import * as THREE from "three";
import type { ViewMode } from "../state/store";
import type { ArtifactVisualState } from "./artifact-states";
import type { RenderItem } from "./render-model";

export interface PieceSurface {
  color: string;
  emissive: string;
  intensity: number;
  shimmer: "blueprint" | "untracked" | "conflict" | null;
  opacity: number;
  edges: string | null;
  ghost: boolean;
}

export const DEFAULT_EDGES = "#151a26";
export const SELECTED_EDGES = "#ffd76a";

const STAGED_TINT = "#5aa9ff";
const STAGED_GLOW = "#2f9dff";
const MODIFIED_GLOW = "#ffd76a";
const UNTRACKED_GLOW = "#b476ff";
const CONFLICT_GLOW = "#ff5050";
const SELECTED_GLOW = "#ffd76a";
const BLUEPRINT_TINT = "#5aa9ff";
const BLUEPRINT_EDGES = "#8fc4ff";
const SNAPSHOT_TINT = "#dfe7f3";
const SNAPSHOT_EDGES = "#46536e";
const REMOTE_TINT = "#38bdf8";
const REMOTE_EDGES = "#7dd3fc";
const REMOVAL_TINT = "#ff6b6b";
const REMOVAL_GLOW = "#ff3030";
const THEIRS_EDGES = "#5b2430";

function lerpColor(base: string, target: string, amount: number): string {
  return new THREE.Color(base).lerp(new THREE.Color(target), amount).getStyle();
}

function workingSurface(
  item: RenderItem,
  state: ArtifactVisualState | undefined,
  selected: boolean,
): PieceSurface {
  let color = item.color;
  let emissive = "#000000";
  let intensity = 0;
  let shimmer: PieceSurface["shimmer"] = null;

  if (state?.conflict) {
    emissive = CONFLICT_GLOW;
    intensity = 0.3;
    shimmer = "conflict";
  } else if (state && state.staged && state.staged !== "removed") {
    color = lerpColor(color, STAGED_TINT, 0.5);
    emissive = STAGED_GLOW;
    intensity = 0.28;
    shimmer = "blueprint";
  }

  if (state?.unstaged === "modified") {
    emissive = MODIFIED_GLOW;
    intensity = 0.45;
    shimmer = null;
  } else if (state?.unstaged === "untracked") {
    emissive = UNTRACKED_GLOW;
    intensity = 0.4;
    shimmer = "untracked";
  }

  if (selected && intensity === 0) {
    emissive = SELECTED_GLOW;
    intensity = 0.35;
  }

  return {
    color,
    emissive,
    intensity,
    shimmer,
    opacity: 1,
    edges: selected ? SELECTED_EDGES : DEFAULT_EDGES,
    ghost: false,
  };
}

export function resolveSurface(
  item: RenderItem,
  state: ArtifactVisualState | undefined,
  selected: boolean,
  mode: ViewMode,
): PieceSurface {
  const ghost = !item.visible;
  let surface: PieceSurface;

  if (mode === "blueprint") {
    const isStaged = Boolean(state && state.staged && state.staged !== "removed");
    surface = {
      color: selected
        ? lerpColor(item.color, "#ffffff", 0.3)
        : lerpColor(item.color, BLUEPRINT_TINT, 0.55),
      emissive: selected ? SELECTED_GLOW : isStaged ? STAGED_GLOW : "#000000",
      intensity: selected ? 0.5 : isStaged ? 0.28 : 0,
      shimmer: isStaged ? "blueprint" : null,
      opacity: 1,
      edges: selected ? "#0d1424" : BLUEPRINT_EDGES,
      ghost,
    };
  } else if (mode === "snapshot") {
    surface = {
      color: selected
        ? lerpColor(item.color, "#ffffff", 0.35)
        : lerpColor(item.color, SNAPSHOT_TINT, 0.4),
      emissive: selected ? SELECTED_GLOW : "#000000",
      intensity: selected ? 0.5 : 0,
      shimmer: null,
      opacity: 1,
      edges: selected ? "#0d1424" : SNAPSHOT_EDGES,
      ghost,
    };
  } else if (mode === "remote") {
    const isConflict = Boolean(state?.conflict);
    surface = {
      color: selected
        ? lerpColor(item.color, "#ffffff", 0.3)
        : lerpColor(item.color, REMOTE_TINT, 0.45),
      emissive: selected ? SELECTED_GLOW : isConflict ? CONFLICT_GLOW : "#000000",
      intensity: selected ? 0.5 : isConflict ? 0.3 : 0,
      shimmer: isConflict ? "conflict" : null,
      opacity: 1,
      edges: selected ? "#0d1424" : REMOTE_EDGES,
      ghost,
    };
  } else {
    surface = workingSurface(item, state, selected);
  }

  if (ghost) {
    surface.color = item.color;
    surface.emissive = "#000000";
    surface.intensity = 0;
    surface.shimmer = null;
    surface.opacity = 0.14;
    surface.edges = null;
  }
  return surface;
}

export type PhantomKind = "removal" | "theirs";

export function phantomSurface(
  item: RenderItem,
  kind: PhantomKind,
  selected: boolean,
): PieceSurface {
  if (kind === "removal") {
    return {
      color: lerpColor(item.color, REMOVAL_TINT, 0.4),
      emissive: REMOVAL_GLOW,
      intensity: 0.22,
      shimmer: "conflict",
      opacity: 0.22,
      edges: null,
      ghost: true,
    };
  }
  return {
    color: lerpColor(item.color, REMOVAL_TINT, 0.5),
    emissive: CONFLICT_GLOW,
    intensity: 0.28,
    shimmer: "conflict",
    opacity: 0.3,
    edges: selected ? SELECTED_EDGES : THEIRS_EDGES,
    ghost: false,
  };
}
