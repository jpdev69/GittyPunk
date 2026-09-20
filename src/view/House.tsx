import { useMemo } from "react";
import { headCommit } from "../engine";
import { useAppStore } from "../state/store";
import type { ViewMode } from "../state/store";
import { computeVisualStates } from "./artifact-states";
import type { VisualStateMap } from "./artifact-states";
import { ArtifactGeometry, DeletionMarker } from "./geometry";
import { buildRenderList, toRenderItem } from "./render-model";
import type { RenderItem } from "./render-model";
import { phantomSurface, resolveSurface } from "./surfaces";
import type { PhantomKind } from "./surfaces";

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
  if (item.geometry === "container") return null;
  const surface = resolveSurface(item, state, selected, mode);
  return (
    <group
      position={item.position}
      rotation={item.rotation}
      scale={item.scale}
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

  const { items, states, phantoms } = useMemo(() => {
    const states = computeVisualStates(repo);
    const phantoms: Phantom[] = [];
    if (mode === "working") {
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
    return {
      items: buildRenderList(
        mode === "working"
          ? repo.working
          : mode === "blueprint"
            ? repo.index
            : headCommit(repo).tree,
      ),
      states,
      phantoms,
    };
  }, [repo, mode]);

  return (
    <group>
      {items.map((item) => (
        <ArtifactMesh
          key={item.path}
          item={item}
          state={states[item.path]}
          selected={selected === item.path}
          mode={mode}
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
