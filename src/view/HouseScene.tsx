import { CameraControls } from "@react-three/drei";
import type { CameraControlsImpl } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useAppStore } from "../state/store";
import House from "./House";

const HOUSE_BOX = new THREE.Box3(
  new THREE.Vector3(-5, -0.4, -5),
  new THREE.Vector3(5, 15.2, 5),
);

function deckFocusBox(path: string): THREE.Box3 | null {
  const deck = useAppStore.getState().repo.working[path];
  if (!deck) return null;
  const [x, y, z] = deck.transform.position;
  const half = path === "attic" ? 2.4 : 2.7;
  return new THREE.Box3(
    new THREE.Vector3(x - half, y - 0.5, z - half),
    new THREE.Vector3(x + half, y + 0.7, z + half),
  );
}

function SceneControls() {
  const focused = useAppStore((state) => state.focused);
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const lastInteractionRef = useRef(0);

  useFrame((_, delta) => {
    if (performance.now() - lastInteractionRef.current < 2500) return;
    controlsRef.current?.rotate(delta * 0.02, 0, false);
  });

  useEffect(() => {
    const controls = controlsRef.current;
    lastInteractionRef.current = performance.now();
    if (!controls) return;
    const box = focused
      ? deckFocusBox(focused) ?? HOUSE_BOX
      : HOUSE_BOX;
    void controls.fitToBox(box, true);
  }, [focused]);

  const markInteraction = () => {
    lastInteractionRef.current = performance.now();
  };

  return (
    <CameraControls
      makeDefault
      ref={controlsRef}
      onControlStart={markInteraction}
      onControlEnd={markInteraction}
      onTransitionStart={markInteraction}
    />
  );
}

function Ground() {
  return (
    <mesh
      position={[0, -0.25, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <circleGeometry args={[16, 48]} />
      <meshToonMaterial color="#1a2740" />
    </mesh>
  );
}

function SelectionCard() {
  const selected = useAppStore((state) => state.selected);
  const artifact = useAppStore((state) =>
    state.selected ? state.repo.working[state.selected] : undefined,
  );
  if (!selected || !artifact) return null;
  return (
    <aside className="selection-card">
      <h2>{artifact.name}</h2>
      <p className="selection-path">{selected}</p>
      <dl>
        <div>
          <dt>kind</dt>
          <dd>{artifact.kind}</dd>
        </div>
        <div>
          <dt>position</dt>
          <dd>[{artifact.transform.position.join(", ")}]</dd>
        </div>
        <div>
          <dt>color</dt>
          <dd>{artifact.color}</dd>
        </div>
        <div>
          <dt>state</dt>
          <dd>{artifact.visible ? "visible" : "hidden"}</dd>
        </div>
      </dl>
    </aside>
  );
}

function HintBar() {
  const focused = useAppStore((state) => state.focused);
  return (
    <p className="scene-hint">
      {focused
        ? "Click empty space to zoom back out"
        : "Click an artifact to inspect - click a deck to zoom"}
    </p>
  );
}

export default function HouseScene() {
  return (
    <div className="scene-wrap">
      <Canvas
        className="house-scene"
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ position: [18, 13, 18], zoom: 46, near: -100, far: 400 }}
        onPointerMissed={() => {
          useAppStore.getState().select(null);
          useAppStore.getState().focusDeck(null);
        }}
      >
        <color attach="background" args={["#0f1729"]} />
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[14, 22, 10]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={18}
          shadow-camera-bottom={-10}
          shadow-camera-near={2}
          shadow-camera-far={60}
          shadow-bias={-0.0004}
        />
        <SceneControls />
        <House />
        <Ground />
      </Canvas>
      <SelectionCard />
      <HintBar />
    </div>
  );
}
