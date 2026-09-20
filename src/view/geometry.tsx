import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import type { GeometryKind } from "./render-model";
import type { PieceSurface } from "./surfaces";

const gradientMap = new THREE.DataTexture(
  new Uint8Array([70, 135, 205, 255]),
  4,
  1,
  THREE.RedFormat,
);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

type Vec3Tuple = [number, number, number];

interface PieceProps {
  surface: PieceSurface;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  children: ReactNode;
}

const SHIMMER_WAVES: Record<
  Exclude<PieceSurface["shimmer"], null>,
  { amplitude: number; speed: number }
> = {
  blueprint: { amplitude: 0.12, speed: 2.4 },
  untracked: { amplitude: 0.2, speed: 3.1 },
  conflict: { amplitude: 0.32, speed: 4.2 },
};

function Piece({ surface, position, rotation, children }: PieceProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const flipRef = useRef(0);

  useEffect(() => {
    if (surface.shimmer) flipRef.current = performance.now();
  }, [surface.shimmer]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const material = mesh.material;
    if (!(material instanceof THREE.MeshToonMaterial)) return;
    if (!surface.shimmer) {
      material.emissiveIntensity = surface.intensity;
      return;
    }
    const wave = SHIMMER_WAVES[surface.shimmer];
    const t = performance.now() / 1000;
    const since = (performance.now() - flipRef.current) / 1000;
    const spike = Math.max(0, 0.8 - since * 1.6);
    material.emissiveIntensity =
      surface.intensity +
      wave.amplitude * (0.5 + 0.5 * Math.sin(t * wave.speed)) +
      spike;
  });

  const ghost = surface.ghost;
  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      castShadow={!ghost}
      receiveShadow={!ghost}
    >
      {children}
      <meshToonMaterial
        color={surface.color}
        gradientMap={gradientMap}
        emissive={surface.emissive}
        emissiveIntensity={surface.intensity}
        transparent={ghost || surface.opacity < 1}
        opacity={surface.opacity}
        depthWrite={!ghost}
      />
      {surface.edges ? <Edges threshold={20} color={surface.edges} /> : null}
    </mesh>
  );
}

interface ArtifactGeometryProps {
  kind: GeometryKind;
  surface: PieceSurface;
}

export function ArtifactGeometry({ kind, surface }: ArtifactGeometryProps) {
  const piece = (
    position: Vec3Tuple,
    children: ReactNode,
    rotation?: Vec3Tuple,
  ) => (
    <Piece surface={surface} position={position} rotation={rotation}>
      {children}
    </Piece>
  );

  switch (kind) {
    case "deck":
      return piece([0, 0.2, 0], <boxGeometry args={[5, 0.4, 5]} />);
    case "attic":
      return piece([0, 0.2, 0], <boxGeometry args={[4.6, 0.4, 4.6]} />);
    case "walls":
      return piece([0, 0.6, 0], <boxGeometry args={[1, 1.2, 0.16]} />);
    case "roof":
      return (
        <>
          {piece(
            [0, 0.8, 0],
            <coneGeometry args={[4.6, 1.5, 4]} />,
            [0, Math.PI / 4, 0],
          )}
          {piece([1.7, 0.95, -0.7], <boxGeometry args={[0.5, 1.1, 0.5]} />)}
        </>
      );
    case "stairs":
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((step) => (
            <Piece
              key={step}
              surface={surface}
              position={[0, -1.1 + 0.25 + step * 0.5, step * 0.35 - 0.875]}
            >
              <boxGeometry args={[0.9, 0.5, 0.35]} />
            </Piece>
          ))}
        </>
      );
    case "windows":
      return (
        <>
          {[0, 3].flatMap((row) =>
            [-1.55, 0, 1.55].map((x) => (
              <Piece key={`${row}:${x}`} surface={surface} position={[x, row, -1.15]}>
                <boxGeometry args={[0.95, 1.15, 0.12]} />
              </Piece>
            )),
          )}
        </>
      );
    case "table":
      return (
        <>
          {piece([0, 0.72, 0], <boxGeometry args={[1.4, 0.12, 0.9]} />)}
          {[-0.55, 0.55].flatMap((x) =>
            [-0.32, 0.32].map((z) => (
              <Piece key={`${x}:${z}`} surface={surface} position={[x, 0.33, z]}>
                <boxGeometry args={[0.12, 0.66, 0.12]} />
              </Piece>
            )),
          )}
        </>
      );
    case "chair":
      return (
        <>
          {piece([0, 0.42, 0], <boxGeometry args={[0.55, 0.08, 0.55]} />)}
          {[-0.22, 0.22].flatMap((x) =>
            [-0.22, 0.22].map((z) => (
              <Piece
                key={`${x}:${z}`}
                surface={surface}
                position={[x, 0.21, z]}
              >
                <boxGeometry args={[0.07, 0.42, 0.07]} />
              </Piece>
            )),
          )}
          {piece([0, 0.77, -0.23], <boxGeometry args={[0.55, 0.62, 0.09]} />)}
        </>
      );
    case "sofa":
      return (
        <>
          {piece([0, 0.21, 0], <boxGeometry args={[1.6, 0.42, 0.8]} />)}
          {piece([0, 0.63, -0.3], <boxGeometry args={[1.6, 0.62, 0.2]} />)}
          {piece([-0.69, 0.3, 0], <boxGeometry args={[0.22, 0.6, 0.8]} />)}
          {piece([0.69, 0.3, 0], <boxGeometry args={[0.22, 0.6, 0.8]} />)}
        </>
      );
    case "bed":
      return (
        <>
          {piece([0, 0.175, 0], <boxGeometry args={[1.15, 0.35, 2.05]} />)}
          {piece([0, 0.45, 0], <boxGeometry args={[1.05, 0.2, 1.95]} />)}
          {piece([0, 0.55, -1.0], <boxGeometry args={[1.15, 0.85, 0.14]} />)}
          {piece([0, 0.62, -0.72], <boxGeometry args={[0.62, 0.14, 0.38]} />)}
        </>
      );
    case "lamp":
      return (
        <>
          {piece(
            [0, 0.04, 0],
            <cylinderGeometry args={[0.14, 0.2, 0.08, 16]} />,
          )}
          {piece(
            [0, 0.55, 0],
            <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />,
          )}
          {piece([0, 1.12, 0], <coneGeometry args={[0.3, 0.42, 20]} />)}
        </>
      );
    case "tv":
      return (
        <>
          {piece([0, 0.03, 0], <boxGeometry args={[0.8, 0.06, 0.4]} />)}
          {piece([0, 0.3, 0], <boxGeometry args={[0.16, 0.48, 0.16]} />)}
          {piece([0, 0.72, 0.02], <boxGeometry args={[1.2, 0.7, 0.1]} />)}
        </>
      );
    case "toilet":
      return (
        <>
          {piece(
            [0, 0.21, -0.05],
            <cylinderGeometry args={[0.3, 0.34, 0.42, 20]} />,
          )}
          {piece([0, 0.55, 0.28], <boxGeometry args={[0.55, 0.55, 0.2]} />)}
        </>
      );
    case "sink":
      return (
        <>
          {piece([0, 0.36, 0], <boxGeometry args={[0.22, 0.72, 0.22]} />)}
          {piece([0, 0.87, 0], <boxGeometry args={[0.75, 0.22, 0.55]} />)}
        </>
      );
    case "bathtub":
      return (
        <>
          {piece([0, 0.275, 0], <boxGeometry args={[1.6, 0.55, 0.85]} />)}
          {piece([0, 0.55, 0], <boxGeometry args={[1.7, 0.1, 0.95]} />)}
        </>
      );
    case "box":
      return piece([0, 0.325, 0], <boxGeometry args={[0.85, 0.65, 0.85]} />);
    case "plant":
      return (
        <>
          {piece(
            [0, 0.19, 0],
            <cylinderGeometry args={[0.2, 0.26, 0.38, 16]} />,
          )}
          {piece([0, 0.72, 0], <sphereGeometry args={[0.34, 16, 12]} />)}
        </>
      );
    case "rug":
      return piece([0, 0.03, 0], <boxGeometry args={[1.7, 0.06, 1.15]} />);
    case "container":
      return null;
    case "crate":
    default:
      return piece([0, 0.45, 0], <boxGeometry args={[0.9, 0.9, 0.9]} />);
  }
}

export function DeletionMarker() {
  return (
    <group position={[0, 1.6, 0]}>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.62, 0.09, 0.09]} />
        <meshBasicMaterial color="#ff4545" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[0.62, 0.09, 0.09]} />
        <meshBasicMaterial color="#ff4545" />
      </mesh>
    </group>
  );
}

interface OutlineSpec {
  size: Vec3Tuple;
  offset: Vec3Tuple;
}

const OUTLINES: Partial<Record<GeometryKind, OutlineSpec>> = {
  deck: { size: [5, 0.4, 5], offset: [0, 0.2, 0] },
  attic: { size: [4.6, 0.4, 4.6], offset: [0, 0.2, 0] },
  roof: { size: [6, 1.8, 6], offset: [0, 0.9, 0] },
  stairs: { size: [1, 3, 2.4], offset: [0, 0.1, 0] },
  windows: { size: [3.9, 1.2, 0.3], offset: [0, 0, -1.15] },
  table: { size: [1.4, 0.78, 0.9], offset: [0, 0.39, 0] },
  chair: { size: [0.55, 0.8, 0.55], offset: [0, 0.4, 0] },
  sofa: { size: [1.6, 0.85, 0.8], offset: [0, 0.42, 0] },
  bed: { size: [1.15, 0.9, 2.05], offset: [0, 0.45, 0] },
  lamp: { size: [0.6, 1.35, 0.6], offset: [0, 0.68, 0] },
  tv: { size: [1.2, 0.8, 0.4], offset: [0, 0.4, 0] },
  toilet: { size: [0.7, 0.8, 0.7], offset: [0, 0.4, 0.1] },
  sink: { size: [0.75, 0.95, 0.55], offset: [0, 0.48, 0] },
  bathtub: { size: [1.7, 0.65, 0.95], offset: [0, 0.33, 0] },
  box: { size: [0.85, 0.65, 0.85], offset: [0, 0.33, 0] },
  plant: { size: [0.68, 1.1, 0.68], offset: [0, 0.55, 0] },
  rug: { size: [1.7, 0.1, 1.15], offset: [0, 0.05, 0] },
  walls: { size: [1, 1.2, 0.16], offset: [0, 0.6, 0] },
  crate: { size: [0.9, 0.9, 0.9], offset: [0, 0.45, 0] },
};

export function OutlineGhost({
  kind,
  color,
  position,
  scale,
}: {
  kind: GeometryKind;
  color: string;
  position: Vec3Tuple;
  scale?: Vec3Tuple;
}) {
  const spec = OUTLINES[kind];
  if (!spec) return null;
  return (
    <mesh
      scale={scale ?? [1, 1, 1]}
      position={[
        position[0] + spec.offset[0],
        position[1] + spec.offset[1],
        position[2] + spec.offset[2],
      ]}
    >
      <boxGeometry args={spec.size} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.04}
        depthWrite={false}
      />
      <Edges threshold={20} color={color} />
    </mesh>
  );
}
