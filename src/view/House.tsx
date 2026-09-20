import { useMemo } from "react";
import { useAppStore } from "../state/store";
import { ArtifactGeometry } from "./geometry";
import { buildRenderList } from "./render-model";
import type { RenderItem } from "./render-model";

function isDeckKind(kind: RenderItem["geometry"]): boolean {
  return kind === "deck" || kind === "attic";
}

function ArtifactMesh({
  item,
  selected,
}: {
  item: RenderItem;
  selected: boolean;
}) {
  const select = useAppStore((state) => state.select);
  const focusDeck = useAppStore((state) => state.focusDeck);
  if (item.geometry === "container") return null;
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
      <ArtifactGeometry
        kind={item.geometry}
        color={item.color}
        selected={selected}
        ghost={!item.visible}
      />
    </group>
  );
}

export default function House() {
  const repo = useAppStore((state) => state.repo);
  const selected = useAppStore((state) => state.selected);
  const items = useMemo(() => buildRenderList(repo.working), [repo]);
  return (
    <group>
      {items.map((item) => (
        <ArtifactMesh
          key={item.path}
          item={item}
          selected={selected === item.path}
        />
      ))}
    </group>
  );
}
