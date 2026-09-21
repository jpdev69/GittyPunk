import { useMemo } from "react";
import { buildInitialHouse, currentBranch } from "../engine";
import { useAppStore } from "../state/store";
import { COMPARE_SIDE_OFFSET } from "./compare";
import { ArtifactGeometry } from "./geometry";
import { buildRenderList } from "./render-model";
import { resolveSurface } from "./surfaces";

export default function RemoteSideBySideView() {
  const repo = useAppStore((state) => state.repo);
  const selected = useAppStore((state) => state.selected);
  const select = useAppStore((state) => state.select);
  const selectedRemoteBranch = useAppStore(
    (state) => state.selectedRemoteBranch,
  );

  const { localItems, remoteItems } = useMemo(() => {
    const activeBranch =
      selectedRemoteBranch ?? currentBranch(repo) ?? "main";
    const originTip =
      repo.origin.branches[activeBranch] ?? Object.values(repo.origin.branches)[0];
    const originCommit = originTip ? repo.origin.commits[originTip] : undefined;
    const initialCommitTree =
      Object.values(repo.commits).find((c) => c.parents.length === 0)?.tree ??
      buildInitialHouse();
    const remoteTree = originCommit ? originCommit.tree : initialCommitTree;

    return {
      localItems: buildRenderList(repo.working),
      remoteItems: buildRenderList(remoteTree),
    };
  }, [repo, selectedRemoteBranch]);

  return (
    <group>
      {/* Left: Local House */}
      <group position={[-COMPARE_SIDE_OFFSET, 0, 0]}>
        {localItems.map((item) => {
          if (item.geometry === "container") return null;
          return (
            <group
              key={item.path}
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
              <ArtifactGeometry
                kind={item.geometry}
                surface={resolveSurface(
                  item,
                  undefined,
                  selected === item.path,
                  "working",
                )}
              />
            </group>
          );
        })}
      </group>

      {/* Right: Remote House (origin) */}
      <group position={[COMPARE_SIDE_OFFSET, 0, 0]}>
        {remoteItems.map((item) => {
          if (item.geometry === "container") return null;
          return (
            <group
              key={item.path}
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
              <ArtifactGeometry
                kind={item.geometry}
                surface={resolveSurface(
                  item,
                  undefined,
                  selected === item.path,
                  "remote",
                )}
              />
            </group>
          );
        })}
      </group>
    </group>
  );
}
