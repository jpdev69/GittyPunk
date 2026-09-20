# AGENTS.md

GittyPunk is a Git SIMULATION: a 3D isometric house IS the repository.

## Hard constraints

- NEVER shell out to the real `git` binary. All commands are interpreted
  by the in-memory engine in `src/engine`.
- NEVER call GitHub or any network API. The "remote house" is simulated.
- Command syntax stays identical to real git.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript project check
- `npm test` — Vitest suite (single run)
- `npm run test:watch` — Vitest watch mode

## Architecture (ESLint-enforced layering)

- `src/engine` — simulated Git engine. Pure: no DOM, React, Three.js,
  zustand, or imports from other src folders.
- `src/parser` — command tokenizer and executor. May import only
  `src/engine`.
- `src/state` — zustand stores bridging engine and UI.
- `src/view` — react-three-fiber house rendering.
- `src/ui` — terminal and panels.

## Process

- Build plan lives in `build-plan/`; follow phases in order and complete
  each phase's verification checklist before starting the next.
- Ideation docs live in `predates/` and are authoritative for design intent.
