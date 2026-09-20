import { CameraControls } from "@react-three/drei";
import type { CameraControlsImpl } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { headCommit } from "../engine";
import ComparePanel from "../ui/ComparePanel";
import HistoryPanel from "../ui/HistoryPanel";
import { useAppStore } from "../state/store";
import CompareView from "./compare";
import House from "./House";

const HOUSE_BOX = new THREE.Box3(
  new THREE.Vector3(-5, -0.4, -5),
  new THREE.Vector3(5, 8.9, 5),
);

const COMPARE_BOX = new THREE.Box3(
  new THREE.Vector3(-13.5, -0.4, -5),
  new THREE.Vector3(13.5, 15.2, 5),
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
  const diffView = useAppStore((state) => state.diffView);
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
    const box = diffView
      ? COMPARE_BOX
      : focused
        ? deckFocusBox(focused) ?? HOUSE_BOX
        : HOUSE_BOX;
    void controls.fitToBox(box, true);
  }, [focused, diffView]);

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
  const repo = useAppStore((state) => state.repo);
  const artifact = selected
    ? repo.working[selected] ??
      repo.index[selected] ??
      headCommit(repo).tree[selected]
    : undefined;
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

function TravelBanner() {
  const travelCommit = useAppStore((state) => state.travelCommit);
  const repo = useAppStore((state) => state.repo);
  const setTravelCommit = useAppStore((state) => state.setTravelCommit);
  if (!travelCommit) return null;
  const commit = repo.commits[travelCommit] ?? null;
  return (
    <div className="travel-banner">
      <span>
        Viewing snapshot {travelCommit.slice(0, 7)}
        {commit ? ` - ${commit.message}` : ""}
      </span>
      <button type="button" onClick={() => setTravelCommit(null)}>
        Return to working house
      </button>
    </div>
  );
}

function HintBar() {
  const focused = useAppStore((state) => state.focused);
  const viewMode = useAppStore((state) => state.viewMode);
  const diffView = useAppStore((state) => state.diffView);
  const travelCommit = useAppStore((state) => state.travelCommit);
  if (diffView) {
    return (
      <p className="scene-hint">
        Side-by-side compare - changed artifacts glow blue, arrows show moves
      </p>
    );
  }
  if (travelCommit) {
    return (
      <p className="scene-hint">
        Detached snapshot view - the working house is untouched
      </p>
    );
  }
  if (focused) {
    return <p className="scene-hint">Click empty space to zoom back out</p>;
  }
  if (viewMode === "blueprint") {
    return (
      <p className="scene-hint">
        Staged Blueprint - what the next commit will capture
      </p>
    );
  }
  if (viewMode === "snapshot") {
    return (
      <p className="scene-hint">Commit Snapshot - the house as last committed</p>
    );
  }
  return (
    <p className="scene-hint">
      Click an artifact to inspect - click a deck to zoom
    </p>
  );
}

function FlashOverlay() {
  const flash = useAppStore((state) => state.flash);
  if (!flash) return null;
  return (
    <div key={flash.at} className={`flash flash-${flash.kind}`}>
      <p>{flash.message}</p>
    </div>
  );
}

export default function HouseScene() {
  const diffView = useAppStore((state) => state.diffView);
  return (
    <div className="scene-wrap">
      <Canvas
        className="house-scene"
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ position: [16, 10, 16], zoom: 44, near: -100, far: 400 }}
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
        {diffView ? <CompareView /> : <House />}
        <Ground />
      </Canvas>
      <SelectionCard />
      <HistoryPanel />
      <ComparePanel />
      <TravelBanner />
      <FlashOverlay />
      <HintBar />
    </div>
  );
}
