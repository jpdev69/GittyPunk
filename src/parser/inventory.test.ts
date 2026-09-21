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
  const colleagueMoved = moveArtifact(colleague, "lowerdeck/table", [5, 0.4, 0]);
  const colleagueCommitted = stageAndCommit(
    colleagueMoved,
    "lowerdeck/table",
    "Colleague move",
  ).repo;
  repo = applyOriginUpdate(repo, push(colleagueCommitted).repo.origin);
  repo = fetch(repo).repo;

  repo = createBranch(repo, "feature");
  repo = checkout(repo, "feature");
  repo = recolorArtifact(repo, "upperdeck/bed", "#00ffff");
  repo = stageAndCommit(repo, "upperdeck/bed", "Feature bed").repo;
  repo = checkout(repo, "main");

  repo = addNewArtifact(repo, "lowerdeck/rug", "#ff8800");
  repo = moveArtifact(repo, "lowerdeck/tv", [1, 0.6, 2]);
  repo = stage(repo, "lowerdeck/rug");
  repo = stage(repo, "lowerdeck/tv");
  repo = commit(repo, { message: "Rug and tv" }).repo;
  repo = recolorArtifact(repo, "lowerdeck/sofa", "#112233");
  repo = stageAndCommit(repo, "lowerdeck/sofa", "Recolor sofa").repo;

  const env: ExecutionEnv = {
    bundles: { "house-backup.bundle": bundleCreate(repo) },
  };

  let dirty = repo;
  dirty = recolorArtifact(dirty, "lowerdeck/chair", "#ffaa00");
  dirty = stage(dirty, "lowerdeck/chair");
  dirty = hideArtifact(dirty, "upperdeck/lamp");
  dirty = addNewArtifact(dirty, "lowerdeck/mat");

  return { clean: repo, dirty, env };
}

function fillPlaceholders(line: string, sha: string): string {
  const map: Record<string, string> = {
    "<specific files>": "lowerdeck/table",
    "<file>": "lowerdeck/table",
    "<message>": "Harness commit",
    "<sha>": sha,
    "<path>": "lowerdeck/rug",
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

const ORIGINAL_INVENTORY_LINES: string[] = [
  "git status --short",
  "git add <specific files>",
  "git diff --cached",
  "git add -p",
  "git commit --amend",
  "git commit --amend --no-edit",
  'git commit -m "<message>"',
  "git config pull.rebase true",
  "git pull",
  "git log origin/main..main --oneline",
  "git log --all --oneline -- <path>",
  "git branch -a --contains <sha>",
  "git remote -v",
  "git show <sha> --stat",
  "git status --ignored",
  "git rm --cached <file>",
  "git reset --hard HEAD~1",
  "git reset --soft HEAD~1",
  "git rebase --onto <other-tip> <merge-base> <branch>",
  "git rebase -i origin/main",
  "git rebase --abort",
  "git filter-repo --force --invert-paths --path <path>",
  "git bundle create ../<repo>-backup.bundle --all",
  "git remote add origin <url>",
  "git fetch origin",
  "git push --force-with-lease origin <branch>",
  "git push --force-with-lease",
  "git ls-files",
  "git ls-tree <commit> --name-only",
  "git diff <old-tip> <new-tip>",
  "git fetch",
  "git reset --hard origin/main",
  "git clone <bundle>",
  "git add <file>",
];

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
  return ORIGINAL_INVENTORY_LINES.map((line) => fillPlaceholders(line, sha));
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
      "M  lowerdeck/chair",
      "?? lowerdeck/mat",
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
