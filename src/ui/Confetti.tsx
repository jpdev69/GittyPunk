import { useEffect, useState } from "react";
import { useAppStore } from "../state/store";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
}

const COLORS = ["#7ee787", "#38bdf8", "#ffd76a", "#f472b6", "#c084fc"];

export default function Confetti() {
  const flash = useAppStore((state) => state.flash);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!flash || !flash.message.includes("🎉")) return;

    const frameId = requestAnimationFrame(() => {
      const list: Particle[] = [];
      for (let i = 0; i < 45; i += 1) {
        list.push({
          id: Math.random(),
          x: 40 + Math.random() * 20,
          y: 10 + Math.random() * 15,
          size: 6 + Math.random() * 8,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          vx: (Math.random() - 0.5) * 40,
          vy: -15 - Math.random() * 25,
          rotation: Math.random() * 360,
          vRot: (Math.random() - 0.5) * 360,
        });
      }
      setParticles(list);
    });

    const timer = setTimeout(() => {
      setParticles([]);
    }, 2800);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timer);
    };
  }, [flash]);

  if (particles.length === 0) return null;

  return (
    <div className="confetti-container">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.4}px`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}
