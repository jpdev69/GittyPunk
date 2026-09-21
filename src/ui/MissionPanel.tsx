import { useState } from "react";
import { MISSIONS, TUTORIAL_MISSION } from "../game/missions";
import { useAppStore } from "../state/store";

export default function MissionPanel() {
  const activeMissionId = useAppStore((state) => state.activeMissionId);
  const completedMissions = useAppStore((state) => state.completedMissions);
  const selectMission = useAppStore((state) => state.selectMission);
  const [open, setOpen] = useState(false);
  const [cardMinimized, setCardMinimized] = useState(false);

  const activeMission = MISSIONS.find((m) => m.id === activeMissionId);
  const displayCard = activeMission ?? TUTORIAL_MISSION;

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
            : "🎮 Sandbox Mode (Free Play)"}
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
              setCardMinimized(false);
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
                  setCardMinimized(false);
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

      {!open && (
        <div className="mission-card">
          <div className="mission-card-header">
            <span className="mission-card-title">
              {activeMission ? "OBJECTIVES" : "TUTORIAL & TIPS"}
            </span>
            <button
              type="button"
              className="mission-card-toggle"
              onClick={() => setCardMinimized((prev) => !prev)}
              aria-label={cardMinimized ? "Expand banner" : "Minimize banner"}
            >
              {cardMinimized ? "▲ Expand" : "▼ Minimize"}
            </button>
          </div>
          {!cardMinimized && (
            <>
              <p className="mission-desc">{displayCard.description}</p>
              <ul className="mission-instructions">
                {displayCard.instructions.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
