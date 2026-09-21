import { describe, expect, it } from "vitest";
import { createInitialRepository } from "../engine";
import { emptyEnv, executeCommand } from "../parser";
import type { ExecutionEnv } from "../parser";
import { MISSIONS, TUTORIAL_MISSION } from "./missions";

function run(
  input: string,
  repo: Parameters<typeof executeCommand>[1],
  env: ExecutionEnv = emptyEnv(),
) {
  return executeCommand(input, repo, env);
}

describe("game missions & validators (Phase 7)", () => {
  it("completes tutorial — your first push", () => {
    const mission = TUTORIAL_MISSION;
    const { env } = mission.setup(createInitialRepository(), emptyEnv());
    let repo = mission.setup(createInitialRepository(), emptyEnv()).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git status", repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git add lowerdeck/sofa", repo, env).repo;
    repo = run('git commit -m "Recolor sofa"', repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git push", repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(true);
  });

  it("completes mission 1 — clean the tree", () => {
    const mission = MISSIONS.find((m) => m.id === "clean_tree")!;
    const { env } = mission.setup(createInitialRepository(), emptyEnv());
    let repo = mission.setup(createInitialRepository(), emptyEnv()).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git add lowerdeck/chair", repo, env).repo;
    repo = run("git add lowerdeck/table", repo, env).repo;
    repo = run('git commit -m "Clean tree"', repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(true);
  });

  it("completes mission 2 — remove the roof", () => {
    const mission = MISSIONS.find((m) => m.id === "remove_roof")!;
    const { env } = mission.setup(createInitialRepository(), emptyEnv());
    let repo = mission.setup(createInitialRepository(), emptyEnv()).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git rm structural/roof", repo, env).repo;
    repo = run('git commit -m "Remove roof"', repo, env).repo;
    repo = run("git push", repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(true);
  });

  it("completes mission 3 — rewind history", () => {
    const mission = MISSIONS.find((m) => m.id === "rewind")!;
    const { env } = mission.setup(createInitialRepository(), emptyEnv());
    let repo = mission.setup(createInitialRepository(), emptyEnv()).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git reset --hard HEAD~1", repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(true);
  });

  it("completes mission 4 — incoming conflict", () => {
    const mission = MISSIONS.find((m) => m.id === "incoming_conflict")!;
    const { env } = mission.setup(createInitialRepository(), emptyEnv());
    let repo = mission.setup(createInitialRepository(), emptyEnv()).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run("git pull", repo, env).repo;
    repo = run("git checkout --ours lowerdeck/sofa", repo, env).repo;
    repo = run('git commit -m "Resolved sofa conflict"', repo, env).repo;
    expect(mission.isCompleted(repo, env)).toBe(true);
  });

  it("completes mission 5 — backup day", () => {
    const mission = MISSIONS.find((m) => m.id === "backup_day")!;
    const { repo, env } = mission.setup(createInitialRepository(), emptyEnv());
    expect(mission.isCompleted(repo, env)).toBe(false);

    const res = run("git bundle create house.bundle --all", repo, env);
    expect(mission.isCompleted(res.repo, res.env)).toBe(true);
  });

  it("completes mission 6 — purge the past", () => {
    const mission = MISSIONS.find((m) => m.id === "purge_past")!;
    const { env } = mission.setup(createInitialRepository(), emptyEnv());
    let repo = mission.setup(createInitialRepository(), emptyEnv()).repo;
    expect(mission.isCompleted(repo, env)).toBe(false);

    repo = run(
      "git filter-repo --force --invert-paths --path lowerdeck/tv",
      repo,
      env,
    ).repo;
    expect(mission.isCompleted(repo, env)).toBe(true);
  });
});
