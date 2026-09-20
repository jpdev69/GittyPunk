import { Edges } from "@react-three/drei";
import type { ReactNode } from "react";
import * as THREE from "three";
import type { GeometryKind } from "./render-model";

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
  color: string;
  selected: boolean;
  ghost: boolean;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  children: ReactNode;
}

function Piece({
  color,
  selected,
  ghost,
  position,
  rotation,
  children,
}: PieceProps) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={!ghost}
      receiveShadow={!ghost}
    >
      {children}
      <meshToonMaterial
        color={color}
        gradientMap={gradientMap}
        emissive={selected ? "#2f9dff" : "#000000"}
        emissiveIntensity={selected ? 0.45 : 0}
        transparent={ghost}
        opacity={ghost ? 0.14 : 1}
        depthWrite={!ghost}
      />
      {ghost ? null : <Edges threshold={20} color="#151a26" />}
    </mesh>
  );
}

function WallsPiece({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.5, 0]} renderOrder={1}>
      <boxGeometry args={[5.6, 13, 5.6]} />
      <meshToonMaterial
        color={color}
        gradientMap={gradientMap}
        transparent
        opacity={0.13}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

interface ArtifactGeometryProps {
  kind: GeometryKind;
  color: string;
  selected: boolean;
  ghost: boolean;
}

export function ArtifactGeometry({
  kind,
  color,
  selected,
  ghost,
}: ArtifactGeometryProps) {
  const piece = (position: Vec3Tuple, children: ReactNode, rotation?: Vec3Tuple) => (
    <Piece
      color={color}
      selected={selected}
      ghost={ghost}
      position={position}
      rotation={rotation}
    >
      {children}
    </Piece>
  );

  switch (kind) {
    case "deck":
      return piece([0, 0.2, 0], <boxGeometry args={[5, 0.4, 5]} />);
    case "attic":
      return piece([0, 0.2, 0], <boxGeometry args={[4.6, 0.4, 4.6]} />);
    case "walls":
      return <WallsPiece color={color} />;
    case "roof":
      return piece(
        [0, 0.8, 0],
        <coneGeometry args={[4.1, 1.7, 4]} />,
        [0, Math.PI / 4, 0],
      );
    case "stairs":
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((step) => (
            <Piece
              key={step}
              color={color}
              selected={selected}
              ghost={ghost}
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
          {[-1.55, 0, 1.55].map((x) => (
            <Piece
              key={x}
              color={color}
              selected={selected}
              ghost={ghost}
              position={[x, 0, -1.15]}
            >
              <boxGeometry args={[0.95, 1.15, 0.12]} />
            </Piece>
          ))}
        </>
      );
    case "table":
      return (
        <>
          {piece([0, 0.72, 0], <boxGeometry args={[1.4, 0.12, 0.9]} />)}
          {[-0.55, 0.55].flatMap((x) =>
            [-0.32, 0.32].map((z) => (
              <Piece
                key={`${x}:${z}`}
                color={color}
                selected={selected}
                ghost={ghost}
                position={[x, 0.33, z]}
              >
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
                color={color}
                selected={selected}
                ghost={ghost}
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
