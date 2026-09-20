import { useMemo } from "react";
import * as THREE from "three";
import { treeOf } from "../engine";
import type { House, Vec3 } from "../engine";
import { useAppStore } from "../state/store";
import { compareChanges } from "./compare-model";
import type { CompareChange } from "./compare-model";
import { ArtifactGeometry, OutlineGhost } from "./geometry";
import { buildRenderList, toRenderItem } from "./render-model";
import type { RenderItem } from "./render-model";
import { resolveSurface } from "./surfaces";
import type { PieceSurface } from "./surfaces";

export const COMPARE_SIDE_OFFSET = 8;

const CHANGED_GLOW = "#7fdcff";
const CHANGED_EDGES = "#9fd3ff";
const ADDED_OUTLINE = "#7ee787";
const REMOVED_OUTLINE = "#ff7b72";

function compareSurface(item: RenderItem, changed: boolean): PieceSurface {
  const base = resolveSurface(item, undefined, false, "snapshot");
  if (!changed) return base;
  return {
    ...base,
    color: item.color,
    emissive: CHANGED_GLOW,
    intensity: 0.35,
    edges: CHANGED_EDGES,
  };
}

function MoveArrow({ from, to }: { from: Vec3; to: Vec3 }) {
  const { dir, origin, length } = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const delta = end.clone().sub(start);
    const distance = delta.length();
    return { dir: delta.normalize(), origin: start, length: distance };
  }, [from, to]);
  if (length < 0.05) return null;
  return <arrowHelper args={[dir, origin, length, "#7fdcff", 0.45, 0.25]} />;
}

function CompareSide({
  tree,
  changes,
  side,
}: {
  tree: House;
  changes: Record<string, CompareChange>;
  side: "from" | "to";
}) {
  const items = useMemo(() => buildRenderList(tree), [tree]);
  return (
    <group>
      {items.map((item) => {
        const change = changes[item.path];
        const before = side === "to" && change?.moved ? change.before : null;
        const beforeOffset = before
          ? ([
              before.transform.position[0] - item.position[0],
              before.transform.position[1] - item.position[1],
              before.transform.position[2] - item.position[2],
            ] as Vec3)
          : null;
        return (
          <group
            key={item.path}
            position={item.position}
            rotation={item.rotation}
            scale={item.scale}
          >
            <ArtifactGeometry
              kind={item.geometry}
              surface={compareSurface(item, change !== undefined)}
            />
            {before && beforeOffset ? (
              <group position={beforeOffset}>
                <ArtifactGeometry
                  kind={toRenderItem(before.id, before).geometry}
                  surface={{
                    color: "#9fb4d8",
                    emissive: "#000000",
                    intensity: 0,
                    shimmer: null,
                    opacity: 0.25,
                    edges: CHANGED_EDGES,
                    ghost: true,
                  }}
                />
                <MoveArrow from={beforeOffset} to={[0, 0, 0]} />
              </group>
            ) : null}
          </group>
        );
      })}
      {Object.values(changes).flatMap((change) => {
        if (side === "from") {
          if (!change.added || !change.after) return [];
          return [
            <OutlineGhost
              key={`added:${change.path}`}
              kind={toRenderItem(change.path, change.after).geometry}
              color={ADDED_OUTLINE}
              position={change.after.transform.position}
            />,
          ];
        }
        if (!change.removed || !change.before) return [];
        return [
          <OutlineGhost
            key={`removed:${change.path}`}
            kind={toRenderItem(change.path, change.before).geometry}
            color={REMOVED_OUTLINE}
            position={change.before.transform.position}
          />,
        ];
      })}
    </group>
  );
}

export default function CompareView() {
  const repo = useAppStore((state) => state.repo);
  const diffView = useAppStore((state) => state.diffView);
  const resolved = useMemo(() => {
    if (!diffView) return null;
    try {
      const fromTree = treeOf(repo, diffView.from);
      const toTree = treeOf(repo, diffView.to);
      return {
        fromTree,
        toTree,
        changes: compareChanges(repo, diffView.from, diffView.to),
      };
    } catch {
      return null;
    }
  }, [repo, diffView]);

  if (!resolved) return null;
  const changes: Record<string, CompareChange> = Object.fromEntries(
    resolved.changes.map((change) => [change.path, change]),
  );
  return (
    <group>
      <group position={[-COMPARE_SIDE_OFFSET, 0, 0]}>
        <CompareSide tree={resolved.fromTree} changes={changes} side="from" />
      </group>
      <group position={[COMPARE_SIDE_OFFSET, 0, 0]}>
        <CompareSide tree={resolved.toTree} changes={changes} side="to" />
      </group>
    </group>
  );
}
