import { create } from "zustand";
import { createInitialRepository } from "../engine";
import type { Repository } from "../engine";
import { emptyEnv, executeCommand } from "../parser";
import type { ExecutionEnv } from "../parser";

export interface TerminalLine {
  kind: "info" | "input" | "output" | "error";
  text: string;
}

export const MAX_TERMINAL_LINES = 400;

export interface AppState {
  repo: Repository;
  env: ExecutionEnv;
  lines: TerminalLine[];
  selected: string | null;
  focused: string | null;
  runCommand: (input: string) => void;
  select: (path: string | null) => void;
  focusDeck: (path: string | null) => void;
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
  runCommand: (input) => {
    const { repo, env, lines } = get();
    const result = executeCommand(input, repo, env);
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
    });
  },
  select: (path) => set({ selected: path }),
  focusDeck: (path) => set({ focused: path }),
}));
