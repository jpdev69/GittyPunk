import { useState } from "react";
import { MISSIONS } from "../game/missions";
import { useAppStore } from "../state/store";

export default function MissionPanel() {
  const activeMissionId = useAppStore((state) => state.activeMissionId);
  const completedMissions = useAppStore((state) => state.completedMissions);
  const selectMission = useAppStore((state) => state.selectMission);
  const [open, setOpen] = useState(false);

  const activeMission = MISSIONS.find((m) => m.id === activeMissionId);

  return (
    <div className="mission-panel-wrap">
      <div className="mission-bar">
        <button
          type="button"
          className="mission-menu-btn"
          onClick={() => setOpen((prev) => !prev)}
        >
          {activeMission
            ? `🎯 ${activeMission.title}`
            : "🎮 Sandbox Mode"}
          <span className="mission-arrow">{open ? " ▲" : " ▼"}</span>
        </button>
      </div>

      {open && (
        <div className="mission-dropdown">
          <button
            type="button"
            className={`mission-option ${!activeMissionId ? "active" : ""}`}
            onClick={() => {
              selectMission("sandbox");
              setOpen(false);
            }}
          >
            🎮 Sandbox Mode (Free Play)
          </button>
          <div className="mission-divider" />
          {MISSIONS.map((mission) => {
            const isCompleted = completedMissions.includes(mission.id);
            const isActive = activeMissionId === mission.id;
            return (
              <button
                key={mission.id}
                type="button"
                className={`mission-option ${isActive ? "active" : ""}`}
                onClick={() => {
                  selectMission(mission.id);
                  setOpen(false);
                }}
              >
                <span className="mission-status">
                  {isCompleted ? "✅ " : isActive ? "🎯 " : "⭕ "}
                </span>
                {mission.title}
              </button>
            );
          })}
        </div>
      )}

      {activeMission && !open && (
        <div className="mission-card">
          <p className="mission-desc">{activeMission.description}</p>
          <ul className="mission-instructions">
            {activeMission.instructions.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
