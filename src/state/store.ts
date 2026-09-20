import { create } from "zustand";
import { createInitialRepository, headCommit } from "../engine";
import type { Repository } from "../engine";
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
  runCommand: (input: string) => void;
  select: (path: string | null) => void;
  focusDeck: (path: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setTravelCommit: (id: string | null) => void;
  closeDiff: () => void;
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
  runCommand: (input) => {
    const { repo, env, lines } = get();
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
    set({
      repo: result.repo,
      env: result.env,
      lines: [...lines, ...added].slice(-MAX_TERMINAL_LINES),
      flash: nextFlash(input, result),
      travelCommit: result.error ? get().travelCommit : null,
      diffView: result.error ? get().diffView : diffTargetFor(input.trim()),
    });
  },
  select: (path) => set({ selected: path }),
  focusDeck: (path) => set({ focused: path }),
  setViewMode: (mode) => set({ viewMode: mode, travelCommit: null }),
  setTravelCommit: (id) => set({ travelCommit: id }),
  closeDiff: () => set({ diffView: null }),
}));
