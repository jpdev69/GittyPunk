import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyOriginUpdate,
  bundleCreate,
  checkout,
  cloneFromBundle,
  commit,
  createBranch,
  createInitialRepository,
  fetch,
  headCommit,
  push,
  stage,
} from "../engine";
import type { Repository } from "../engine";
import {
  addNewArtifact,
  hideArtifact,
  moveArtifact,
  recolorArtifact,
  stageAndCommit,
} from "../engine/test-support";
import { executeCommand } from "./executor";
import { emptyEnv } from "./types";
import type { ExecutionEnv } from "./types";

function buildHarness(): {
  clean: Repository;
  dirty: Repository;
  env: ExecutionEnv;
} {
  let repo = createInitialRepository();
  repo = push(repo).repo;

  const colleague = cloneFromBundle(bundleCreate(repo));
  const colleagueMoved = moveArtifact(colleague, "middledeck/table", [5, 3.4, 0]);
  const colleagueCommitted = stageAndCommit(
    colleagueMoved,
    "middledeck/table",
    "Colleague move",
  ).repo;
  repo = applyOriginUpdate(repo, push(colleagueCommitted).repo.origin);
  repo = fetch(repo).repo;

  repo = createBranch(repo, "feature");
  repo = checkout(repo, "feature");
  repo = recolorArtifact(repo, "upperdeck/bed", "#00ffff");
  repo = stageAndCommit(repo, "upperdeck/bed", "Feature bed").repo;
  repo = checkout(repo, "main");

  repo = addNewArtifact(repo, "middledeck/rug", "#ff8800");
  repo = moveArtifact(repo, "middledeck/tv", [1, 3.6, 2]);
  repo = stage(repo, "middledeck/rug");
  repo = stage(repo, "middledeck/tv");
  repo = commit(repo, { message: "Rug and tv" }).repo;
  repo = recolorArtifact(repo, "middledeck/sofa", "#112233");
  repo = stageAndCommit(repo, "middledeck/sofa", "Recolor sofa").repo;

  const env: ExecutionEnv = {
    bundles: { "house-backup.bundle": bundleCreate(repo) },
  };

  let dirty = repo;
  dirty = recolorArtifact(dirty, "middledeck/chair", "#ffaa00");
  dirty = stage(dirty, "middledeck/chair");
  dirty = hideArtifact(dirty, "upperdeck/lamp");
  dirty = addNewArtifact(dirty, "middledeck/mat");

  return { clean: repo, dirty, env };
}

function fillPlaceholders(line: string, sha: string): string {
  const map: Record<string, string> = {
    "<specific files>": "middledeck/table",
    "<file>": "middledeck/table",
    "<message>": "Harness commit",
    "<sha>": sha,
    "<path>": "middledeck/rug",
    "<other-tip>": "main",
    "<merge-base>": "HEAD",
    "<branch>": "feature",
    "<repo>": "house",
    "<url>": "https://gittypunk.local/backup.git",
    "<commit>": "HEAD",
    "<old-tip>": "HEAD~1",
    "<new-tip>": "HEAD",
    "<bundle>": "house-backup.bundle",
  };
  let filled = line;
  for (const [key, value] of Object.entries(map)) {
    filled = filled.split(key).join(value);
  }
  return filled;
}

function inventoryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "predates", "original-git-available-commands.txt");
}

const DIRTY_COMMANDS = new Set([
  "status",
  "add",
  "rm",
  "diff",
  "restore",
  "commit",
  "ls-files",
]);

function inventoryLines(sha: string): string[] {
  return readFileSync(inventoryPath(), "utf-8")
    .split(/\r?\n/)
    .map((line) => fillPlaceholders(line, sha))
    .filter((line) => line.trim().length > 0);
}

describe("original command inventory", () => {
  it("parses and executes every line of the inventory file", () => {
    const harness = buildHarness();
    const sha = headCommit(harness.clean).id;
    const lines = inventoryLines(sha);
    expect(lines.length).toBeGreaterThanOrEqual(30);
    for (const line of lines) {
      const word = line.split(/\s+/)[1] ?? "";
      const repo = structuredClone(
        DIRTY_COMMANDS.has(word) ? harness.dirty : harness.clean,
      );
      const env = structuredClone(harness.env);
      const result = executeCommand(line, repo, env);
      const text = result.output.join("\n");
      expect(text, `line: ${line}`).not.toMatch(/is not a git command/);
      expect(text, `line: ${line}`).not.toMatch(/unknown option/);
    }
  });

  it("parses and executes the showcase commands from the ideation", () => {
    const harness = buildHarness();
    const extras = [
      "git init",
      "git push",
      "git checkout feature",
      "git merge feature",
      "git branch lounge",
    ];
    for (const line of extras) {
      const result = executeCommand(
        line,
        structuredClone(harness.clean),
        structuredClone(harness.env),
      );
      const text = result.output.join("\n");
      expect(text, `line: ${line}`).not.toMatch(/is not a git command/);
      expect(text, `line: ${line}`).not.toMatch(/unknown option/);
    }
  });

  it("produces meaningful output for the showcase lines", () => {
    const harness = buildHarness();

    const status = executeCommand(
      "git status --short",
      structuredClone(harness.dirty),
      emptyEnv(),
    );
    expect(status.output).toEqual([
      "M  middledeck/chair",
      "?? middledeck/mat",
      " M upperdeck/lamp",
    ]);

    const forced = executeCommand(
      "git push --force-with-lease",
      structuredClone(harness.clean),
      emptyEnv(),
    );
    expect(forced.error).toBe(false);
    expect(forced.output[1]).toMatch(/main -> main$/);

    const log = executeCommand(
      "git log origin/main..main --oneline",
      structuredClone(harness.clean),
      emptyEnv(),
    );
    expect(log.output).toHaveLength(2);
    expect(log.output.map((line) => line.slice(8))).toEqual([
      "Recolor sofa",
      "Rug and tv",
    ]);

    const switched = executeCommand(
      "git checkout feature",
      structuredClone(harness.clean),
      emptyEnv(),
    );
    expect(switched.output).toEqual(["Switched to branch 'feature'"]);

    const merged = executeCommand(
      "git merge feature",
      structuredClone(harness.clean),
      emptyEnv(),
    );
    expect(merged.output).toEqual(["Merge made by the 'ort' strategy."]);
  });
});
