import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { currentBranch, headCommit } from "../engine";
import { useAppStore } from "../state/store";
import type { ViewMode } from "../state/store";
import { computeVisualStates } from "./artifact-states";
import type { VisualStateMap } from "./artifact-states";
import { ArtifactGeometry, DeletionMarker } from "./geometry";
import { buildRenderList, toRenderItem } from "./render-model";
import type { RenderItem } from "./render-model";
import { phantomSurface, resolveSurface } from "./surfaces";
import type { PhantomKind } from "./surfaces";
import { lerpFactor, stepToward } from "./tween";

const scratchVector = new THREE.Vector3();

function isDeckKind(kind: RenderItem["geometry"]): boolean {
  return kind === "deck" || kind === "attic";
}

interface Phantom {
  item: RenderItem;
  kind: PhantomKind;
}

function ArtifactMesh({
  item,
  state,
  selected,
  mode,
}: {
  item: RenderItem;
  state: VisualStateMap[string];
  selected: boolean;
  mode: ViewMode;
}) {
  const select = useAppStore((state) => state.select);
  const focusDeck = useAppStore((state) => state.focusDeck);
  const groupRef = useRef<THREE.Group>(null);
  const itemRef = useRef(item);
  const mountedRef = useRef(false);

  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || mountedRef.current) return;
    mountedRef.current = true;
    const target = itemRef.current;
    group.position.set(...target.position);
    group.rotation.set(...target.rotation);
    group.scale.setScalar(0.02);
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = itemRef.current;
    group.position.lerp(
      scratchVector.set(...target.position),
      lerpFactor(delta, 6),
    );
    group.rotation.set(
      stepToward(group.rotation.x, target.rotation[0], delta, 8),
      stepToward(group.rotation.y, target.rotation[1], delta, 8),
      stepToward(group.rotation.z, target.rotation[2], delta, 8),
    );
    group.scale.lerp(scratchVector.set(...target.scale), lerpFactor(delta, 8));
  });

  if (item.geometry === "container") return null;
  const surface = resolveSurface(item, state, selected, mode);
  return (
    <group
      ref={groupRef}
      onClick={(event) => {
        event.stopPropagation();
        select(item.path);
        if (isDeckKind(item.geometry)) {
          const current = useAppStore.getState().focused;
          focusDeck(current === item.path ? null : item.path);
        }
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <ArtifactGeometry kind={item.geometry} surface={surface} />
    </group>
  );
}

function PhantomMesh({
  item,
  kind,
  selected,
}: {
  item: RenderItem;
  kind: PhantomKind;
  selected: boolean;
}) {
  const select = useAppStore((state) => state.select);
  if (item.geometry === "container") return null;
  const surface = phantomSurface(item, kind, selected);
  return (
    <group
      position={item.position}
      rotation={item.rotation}
      scale={item.scale}
      onClick={(event) => {
        event.stopPropagation();
        select(item.path);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <ArtifactGeometry kind={item.geometry} surface={surface} />
      {kind === "removal" ? <DeletionMarker /> : null}
    </group>
  );
}

export default function House() {
  const repo = useAppStore((state) => state.repo);
  const selected = useAppStore((state) => state.selected);
  const mode = useAppStore((state) => state.viewMode);
  const travelCommit = useAppStore((state) => state.travelCommit);

  const { items, states, phantoms, effectiveMode } = useMemo(() => {
    const travel = travelCommit !== null ? repo.commits[travelCommit] : undefined;
    const effectiveMode: ViewMode = travel ? "snapshot" : mode;
    const states = computeVisualStates(repo);
    const phantoms: Phantom[] = [];
    if (mode === "working" && !travel) {
      const headTree = headCommit(repo).tree;
      for (const state of Object.values(states)) {
        if (state.staged === "removed" && headTree[state.path]) {
          phantoms.push({
            item: toRenderItem(state.path, headTree[state.path]),
            kind: "removal",
          });
        }
        const theirs = state.conflict?.theirs;
        if (theirs) {
          const item = toRenderItem(state.path, theirs);
          const anchor =
            repo.working[state.path] ?? state.conflict?.ours ?? theirs;
          const [x, y, z] = anchor.transform.position;
          item.position = [x + 0.55, y, z + 0.55];
          phantoms.push({ item, kind: "theirs" });
        }
      }
    }
    const originTip =
      repo.origin.branches[currentBranch(repo) ?? "main"] ??
      Object.values(repo.origin.branches)[0];
    const originCommit = originTip ? repo.origin.commits[originTip] : undefined;
    const remoteTree = originCommit ? originCommit.tree : repo.working;

    const tree = travel
      ? travel.tree
      : mode === "working"
        ? repo.working
        : mode === "blueprint"
          ? repo.index
          : mode === "remote"
            ? remoteTree
            : headCommit(repo).tree;
    return {
      items: buildRenderList(tree),
      states,
      phantoms,
      effectiveMode,
    };
  }, [repo, mode, travelCommit]);

  return (
    <group>
      {items.map((item) => (
        <ArtifactMesh
          key={item.path}
          item={item}
          state={states[item.path]}
          selected={selected === item.path}
          mode={effectiveMode}
        />
      ))}
      {phantoms.map(({ item, kind }) => (
        <PhantomMesh
          key={`${kind}:${item.path}`}
          item={item}
          kind={kind}
          selected={selected === item.path}
        />
      ))}
    </group>
  );
}
