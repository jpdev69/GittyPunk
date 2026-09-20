import { Canvas } from "@react-three/fiber";

export default function HouseScene() {
  return (
    <Canvas className="house-scene" camera={{ position: [10, 8, 10] }}>
      <color attach="background" args={["#141d2e"]} />
      <ambientLight intensity={1} />
    </Canvas>
  );
}
