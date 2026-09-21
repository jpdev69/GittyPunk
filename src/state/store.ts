import { create } from "zustand";
import { createInitialRepository, headCommit } from "../engine";
import type { Repository } from "../engine";
import {
  playCommitFreeze,
  playConflictCrunch,
  playPushWhoosh,
  playStageChime,
  playVictoryFanfare,
} from "../game/audio";
import { MISSIONS } from "../game/missions";
import { emptyEnv, executeCommand } from "../parser";
import type { CommandResult, ExecutionEnv } from "../parser";

export interface TerminalLine {
  kind: "info" | "input" | "output" | "error";
  text: string;
}

export const MAX_TERMINAL_LINES = 400;

export type ViewMode = "working" | "blueprint" | "snapshot" | "remote";

export interface DiffView {
  from: string;
  to: string;
}

export interface Flash {
  kind: "stage" | "commit" | "reset" | "conflict" | "error";
  message: string;
  at: number;
}

function diffTargetFor(command: string): DiffView | null {
  if (!/^git diff($|\s)/.test(command)) return null;
  const tokens = command.split(/\s+/).slice(2);
  const cached = tokens.includes("--cached") || tokens.includes("--staged");
  const positionals = tokens.filter((token) => !token.startsWith("-"));
  if (positionals.length >= 2) {
    return { from: positionals[0] ?? "", to: positionals[1] ?? "" };
  }
  if (positionals.length === 1) {
    return cached
      ? { from: positionals[0] ?? "", to: "index" }
      : { from: positionals[0] ?? "", to: "working" };
  }
  return cached
    ? { from: "HEAD", to: "index" }
    : { from: "index", to: "working" };
}

function nextFlash(input: string, result: CommandResult): Flash | null {
  const at = performance.now();
  const command = input.trim();
  if (result.error) {
    return {
      kind: "error",
      message: result.output[0] ?? "",
      at,
    };
  }
  const repo = result.repo;
  if (repo.merge || repo.rebase) {
    return {
      kind: "conflict",
      message: "Conflicts - resolve the glowing artifacts",
      at,
    };
  }
  if (command.startsWith("git push")) {
    return {
      kind: "commit",
      message: "Remote house synced (pushed to origin)",
      at,
    };
  }
  if (command.startsWith("git fetch")) {
    return {
      kind: "stage",
      message: "Fetched updates from origin",
      at,
    };
  }
  if (command.startsWith("git pull")) {
    return {
      kind: "commit",
      message: "Pulled and merged from origin",
      at,
    };
  }
  if (command.startsWith("git clone")) {
    return {
      kind: "reset",
      message: "Cloned house from bundle",
      at,
    };
  }
  if (command.startsWith("git bundle")) {
    return {
      kind: "stage",
      message: "House bundle created",
      at,
    };
  }
  if (command.startsWith("git commit")) {
    return {
      kind: "commit",
      message: `Snapshot frozen: ${headCommit(repo).message}`,
      at,
    };
  }
  if (/^git (add|rm|restore)\b/.test(command)) {
    return { kind: "stage", message: "Blueprint updated", at };
  }
  if (/^git reset\b/.test(command)) {
    return { kind: "reset", message: "House rolled back", at };
  }
  return null;
}

export interface AppState {
  repo: Repository;
  env: ExecutionEnv;
  lines: TerminalLine[];
  selected: string | null;
  focused: string | null;
  viewMode: ViewMode;
  flash: Flash | null;
  travelCommit: string | null;
  diffView: DiffView | null;
  activeMissionId: string | null;
  completedMissions: string[];
  runCommand: (input: string) => void;
  select: (path: string | null) => void;
  focusDeck: (path: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTravelCommit: (id: string | null) => void;
  closeDiff: () => void;
  selectMission: (id: string | null) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  repo: createInitialRepository(),
  env: emptyEnv(),
  lines: [
    {
      kind: "info",
      text: "GittyPunk - the house is your repository. Type git commands below.",
    },
  ],
  selected: null,
  focused: null,
  viewMode: "working",
  flash: null,
  travelCommit: null,
  diffView: null,
  activeMissionId: "tutorial",
  completedMissions: [],
  runCommand: (input) => {
    const { repo, env, lines, activeMissionId, completedMissions } = get();
    const result = executeCommand(input, repo, env);
    if (result.output.length === 1 && result.output[0] === "__CLEAR__") {
      set({ lines: [] });
      return;
    }
    const added: TerminalLine[] = [
      { kind: "input", text: input },
      ...result.output.map((text) => ({
        kind: result.error ? ("error" as const) : ("output" as const),
        text,
      })),
    ];

    const flash = nextFlash(input, result);
    if (flash?.kind === "stage") playStageChime();
    else if (flash?.kind === "commit") {
      if (input.trim().startsWith("git push")) playPushWhoosh();
      else playCommitFreeze();
    } else if (flash?.kind === "conflict") playConflictCrunch();

    const activeMission = MISSIONS.find((m) => m.id === activeMissionId);
    let newlyCompleted = false;
    if (activeMission && !completedMissions.includes(activeMission.id)) {
      if (activeMission.isCompleted(result.repo, result.env)) {
        newlyCompleted = true;
        playVictoryFanfare();
      }
    }
    const nextCompleted = newlyCompleted
      ? [...completedMissions, activeMission!.id]
      : completedMissions;

    const finalFlash = newlyCompleted
      ? {
          kind: "commit" as const,
          message: `🎉 Mission Passed: ${activeMission!.title}!`,
          at: performance.now(),
        }
      : flash;

    set({
      repo: result.repo,
      env: result.env,
      lines: [...lines, ...added].slice(-MAX_TERMINAL_LINES),
      flash: finalFlash,
      completedMissions: nextCompleted,
      travelCommit: result.error ? get().travelCommit : null,
      diffView: result.error ? get().diffView : diffTargetFor(input.trim()),
    });
  },
  select: (path) => set({ selected: path }),
  focusDeck: (path) => set({ focused: path }),
  setViewMode: (mode) => set({ viewMode: mode, travelCommit: null }),
  setTravelCommit: (id) => set({ travelCommit: id }),
  closeDiff: () => set({ diffView: null }),
  selectMission: (id) => {
    if (!id || id === "sandbox") {
      set({
        activeMissionId: null,
        repo: createInitialRepository(),
        env: emptyEnv(),
        selected: null,
        focused: null,
        travelCommit: null,
        diffView: null,
        lines: [
          {
            kind: "info",
            text: "Sandbox Mode (Free Play) - house reset to clean initial state.",
          },
        ],
      });
      return;
    }
    const mission = MISSIONS.find((m) => m.id === id);
    if (!mission) {
      set({ activeMissionId: null });
      return;
    }
    const { repo, env } = mission.setup(createInitialRepository(), emptyEnv());
    set({
      activeMissionId: id,
      repo,
      env,
      selected: null,
      focused: null,
      travelCommit: null,
      diffView: null,
      lines: [
        {
          kind: "info",
          text: `Mission started: ${mission.title}\n${mission.description}`,
        },
      ],
    });
  },
}));
