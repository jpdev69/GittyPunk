import { useMemo } from "react";
import { currentBranch } from "../engine";
import { useAppStore } from "../state/store";
import { COMPARE_SIDE_OFFSET } from "./compare";
import { ArtifactGeometry } from "./geometry";
import { buildRenderList } from "./render-model";
import { resolveSurface } from "./surfaces";

export default function RemoteSideBySideView() {
  const repo = useAppStore((state) => state.repo);
  const selected = useAppStore((state) => state.selected);

  const { localItems, remoteItems } = useMemo(() => {
    const branch = currentBranch(repo) ?? "main";
    const originTip =
      repo.origin.branches[branch] ?? Object.values(repo.origin.branches)[0];
    const originCommit = originTip ? repo.origin.commits[originTip] : undefined;
    const remoteTree = originCommit ? originCommit.tree : repo.working;

    return {
      localItems: buildRenderList(repo.working),
      remoteItems: buildRenderList(remoteTree),
    };
  }, [repo]);

  return (
    <group>
      {/* Left: Local House */}
      <group position={[-COMPARE_SIDE_OFFSET, 0, 0]}>
        {localItems.map((item) => (
          <group
            key={item.path}
            position={item.position}
            rotation={item.rotation}
            scale={item.scale}
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
        ))}
      </group>

      {/* Right: Remote House (origin) */}
      <group position={[COMPARE_SIDE_OFFSET, 0, 0]}>
        {remoteItems.map((item) => (
          <group
            key={item.path}
            position={item.position}
            rotation={item.rotation}
            scale={item.scale}
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
        ))}
      </group>
    </group>
  );
}
