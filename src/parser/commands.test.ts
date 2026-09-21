import { describe, expect, it } from "vitest";
import {
  applyOriginUpdate,
  bundleCreate,
  cloneFromBundle,
  createInitialRepository,
  headCommit,
  push,
  stage,
} from "../engine";
import type { RemoteHouse, Repository } from "../engine";
import {
  addNewArtifact,
  hideArtifact,
  moveArtifact,
  recolorArtifact,
  stageAndCommit,
} from "../engine/test-support";
import { executeCommand } from "./executor";
import { emptyEnv } from "./types";
import type { CommandResult, ExecutionEnv } from "./types";

function run(
  repo: Repository,
  input: string,
  env: ExecutionEnv = emptyEnv(),
): CommandResult {
  return executeCommand(input, repo, env);
}

function runOk(
  repo: Repository,
  input: string,
  env: ExecutionEnv = emptyEnv(),
): CommandResult {
  const result = executeCommand(input, repo, env);
  expect(
    result.error,
    `command failed: ${input}\n${result.output.join("\n")}`,
  ).toBe(false);
  return result;
}

function colleagueDiverge(base: Repository): RemoteHouse {
  const colleague = cloneFromBundle(bundleCreate(base));
  const moved = moveArtifact(colleague, "lowerdeck/table", [5, 0.4, 0]);
  const committed = stageAndCommit(moved, "lowerdeck/table", "Colleague move").repo;
  return push(committed).repo.origin;
}

describe("git status", () => {
  it("reports a clean tree in the long format", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git status");
    expect(result.output[0]).toBe("On branch main");
    expect(result.output.join("\n")).toContain(
      "nothing to commit, working tree clean",
    );
  });

  it("shows staged, unstaged, and untracked entries with --short", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "lowerdeck/chair", "#ffaa00");
    repo = stage(repo, "lowerdeck/chair");
    repo = hideArtifact(repo, "upperdeck/lamp");
    repo = addNewArtifact(repo, "lowerdeck/mat");
    const result = runOk(repo, "git status --short");
    expect(result.output).toEqual([
      "M  lowerdeck/chair",
      "?? lowerdeck/mat",
      " M upperdeck/lamp",
    ]);
  });

  it("renders the long-format sections", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "lowerdeck/chair", "#ffaa00");
    repo = stage(repo, "lowerdeck/chair");
    repo = hideArtifact(repo, "upperdeck/lamp");
    repo = addNewArtifact(repo, "lowerdeck/mat");
    const text = runOk(repo, "git status").output.join("\n");
    expect(text).toContain("Changes to be committed:");
    expect(text).toContain("Changes not staged for commit:");
    expect(text).toContain("Untracked files:");
    expect(text).not.toContain("no changes added to commit");
  });

  it("ends with the no-changes hint when nothing is staged", () => {
    let repo = createInitialRepository();
    repo = hideArtifact(repo, "upperdeck/lamp");
    repo = addNewArtifact(repo, "lowerdeck/mat");
    const text = runOk(repo, "git status").output.join("\n");
    expect(text).toContain(
      'no changes added to commit (use "git add" and/or "git commit -a")',
    );
  });

  it("accepts --ignored without changing the output", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git status --ignored");
    expect(result.output.join("\n")).toContain(
      "nothing to commit, working tree clean",
    );
  });
});

describe("git add and git commit", () => {
  it("stages a path and commits with a quoted message", () => {
    let repo = createInitialRepository();
    repo = moveArtifact(repo, "lowerdeck/table", [2, 0.4, 0]);
    repo = runOk(repo, "git add lowerdeck/table").repo;
    const result = runOk(repo, 'git commit -m "Move the table"');
    expect(result.output[0]).toMatch(/^\[main [0-9a-f]{7}\] Move the table$/);
    expect(result.output[1]).toBe(" 1 artifact changed");
  });

  it("stages everything with git add .", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "lowerdeck/mat");
    repo = runOk(repo, "git add .").repo;
    const result = runOk(repo, 'git commit -m "Add mat"');
    expect(result.output[1]).toBe(" 1 artifact changed");
  });

  it("stages all changes with the simplified -p picker", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#123456");
    const result = runOk(repo, "git add -p");
    expect(result.output).toEqual([
      " lowerdeck/sofa | color",
      "1 artifact change staged (simplified patch picker)",
    ]);
    const status = runOk(result.repo, "git status --short");
    expect(status.output).toEqual(["M  lowerdeck/sofa"]);
  });

  it("keeps the message when amending without -m", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Original message",
    ).repo;
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#abcdef");
    repo = stage(repo, "lowerdeck/sofa");
    const result = runOk(repo, "git commit --amend");
    expect(result.output[0]).toContain("Original message");
    expect(Object.keys(result.repo.commits)).toHaveLength(3);
    expect(headCommit(result.repo).message).toBe("Original message");
  });

  it("replaces the message with --amend -m", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Original message",
    ).repo;
    repo = recolorArtifact(repo, "lowerdeck/sofa", "#abcdef");
    repo = stage(repo, "lowerdeck/sofa");
    const result = runOk(repo, 'git commit --amend -m "New message"');
    expect(result.output[0]).toContain("New message");
    expect(headCommit(result.repo).message).toBe("New message");
  });

  it("refuses to commit a clean tree", () => {
    const repo = createInitialRepository();
    const result = run(repo, 'git commit -m "Empty"');
    expect(result.error).toBe(true);
    expect(result.output.join("\n")).toContain(
      "nothing to commit, working tree clean",
    );
  });

  it("commits tracked changes with -a but leaves untracked files", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "lowerdeck/chair", "#654321");
    repo = addNewArtifact(repo, "lowerdeck/mat");
    const result = runOk(repo, 'git commit -a -m "All tracked"');
    expect(result.output[1]).toBe(" 1 artifact changed");
    const status = runOk(result.repo, "git status --short");
    expect(status.output).toEqual(["?? lowerdeck/mat"]);
  });
});

describe("git rm and git restore", () => {
  it("removes an artifact from index and working tree", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git rm lowerdeck/table");
    expect(result.output).toEqual(["rm 'lowerdeck/table'"]);
    expect(result.repo.index["lowerdeck/table"]).toBeUndefined();
    expect(result.repo.working["lowerdeck/table"]).toBeUndefined();
  });

  it("keeps the working copy with --cached", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git rm --cached lowerdeck/table");
    expect(result.output).toEqual(["rm 'lowerdeck/table'"]);
    expect(result.repo.index["lowerdeck/table"]).toBeUndefined();
    expect(result.repo.working["lowerdeck/table"]).toBeDefined();
  });

  it("requires -r to remove a component", () => {
    const repo = createInitialRepository();
    const refused = run(repo, "git rm lowerdeck");
    expect(refused.error).toBe(true);
    expect(refused.output.join("\n")).toContain(
      "not removing 'lowerdeck' recursively without -r",
    );
    const removed = runOk(repo, "git rm -r lowerdeck");
    expect(removed.output).toEqual(["rm 'lowerdeck'"]);
    expect(removed.repo.working["lowerdeck/chair"]).toBeUndefined();
  });

  it("accepts the game aliases --object and --file", () => {
    const repo = createInitialRepository();
    const aliased = runOk(repo, "git rm --object table");
    expect(aliased.output).toEqual(["rm 'lowerdeck/table'"]);
    const plain = runOk(repo, "git rm table");
    expect(plain.output).toEqual(["rm 'lowerdeck/table'"]);
  });

  it("restores an unstaged change from the index", () => {
    let repo = createInitialRepository();
    repo = hideArtifact(repo, "upperdeck/lamp");
    const result = runOk(repo, "git restore upperdeck/lamp");
    expect(result.repo.working["upperdeck/lamp"]?.visible).toBe(true);
  });

  it("unstages with restore --staged", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "lowerdeck/chair", "#ffaa00");
    repo = stage(repo, "lowerdeck/chair");
    const result = runOk(repo, "git restore --staged lowerdeck/chair");
    expect(result.repo.index["lowerdeck/chair"]?.color).toBe("#c58a4e");
    expect(result.repo.working["lowerdeck/chair"]?.color).toBe("#ffaa00");
  });
});

describe("git diff", () => {
  it("shows unstaged changes as property hunks", () => {
    let repo = createInitialRepository();
    repo = hideArtifact(repo, "upperdeck/lamp");
    const text = runOk(repo, "git diff").output.join("\n");
    expect(text).toContain("diff --git a/upperdeck/lamp b/upperdeck/lamp");
    expect(text).toContain("--- a/upperdeck/lamp");
    expect(text).toContain("@@ visible @@");
    expect(text).toContain("-true");
    expect(text).toContain("+false");
  });

  it("shows staged changes with --cached", () => {
    let repo = createInitialRepository();
    repo = recolorArtifact(repo, "lowerdeck/chair", "#123123");
    repo = stage(repo, "lowerdeck/chair");
    const text = runOk(repo, "git diff --cached").output.join("\n");
    expect(text).toContain("@@ color @@");
  });

  it("compares two revisions", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      moveArtifact(repo, "lowerdeck/table", [2, 0.4, 0]),
      "lowerdeck/table",
      "Move table",
    ).repo;
    const text = runOk(repo, "git diff HEAD~1 HEAD").output.join("\n");
    expect(text).toContain("@@ position @@");
  });

  it("renders new artifacts in diff output", () => {
    let repo = createInitialRepository();
    repo = addNewArtifact(repo, "lowerdeck/mat");
    const text = runOk(repo, "git diff").output.join("\n");
    expect(text).toContain("new artifact lowerdeck/mat");
    expect(text).toContain("--- /dev/null");
  });
});

describe("git log, git show, and git ls-tree", () => {
  it("lists commits oneline", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Recolor sofa",
    ).repo;
    const result = runOk(repo, "git log --oneline");
    expect(result.output).toHaveLength(2);
    expect(result.output[0]).toMatch(/^[0-9a-f]{7} Recolor sofa$/);
    expect(result.output[1]).toMatch(/^[0-9a-f]{7} Initial house$/);
  });

  it("supports the a..b exclusion range", () => {
    let repo = createInitialRepository();
    repo = push(repo).repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    const result = runOk(repo, "git log origin/main..main --oneline");
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toContain("Local one");
  });

  it("filters --all logs by path after --", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug"),
      "lowerdeck/rug",
      "Add rug",
    ).repo;
    repo = runOk(repo, "git checkout -b feature HEAD~1").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "upperdeck/bed", "#00ffff"),
      "upperdeck/bed",
      "Feature bed",
    ).repo;
    const result = runOk(repo, "git log --all --oneline -- lowerdeck/rug");
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toContain("Add rug");
  });

  it("shows a commit with --stat and as a diff", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Recolor sofa",
    ).repo;
    const sha = headCommit(repo).id;
    const stat = runOk(repo, `git show ${sha} --stat`).output.join("\n");
    expect(stat).toContain("commit ");
    expect(stat).toContain(" lowerdeck/sofa | color");
    const body = runOk(repo, `git show ${sha}`).output.join("\n");
    expect(body).toContain("@@ color @@");
  });

  it("lists tree entries with and without --name-only", () => {
    const repo = createInitialRepository();
    const names = runOk(repo, "git ls-tree HEAD --name-only").output;
    expect(names).toContain("lowerdeck/sofa");
    const full = runOk(repo, "git ls-tree HEAD").output;
    expect(full).toContain("component lowerdeck");
    expect(full).toContain("artifact lowerdeck/sofa");
  });

  it("lists staged paths with ls-files", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git ls-files");
    expect(result.output).toContain("structural/roof");
    expect(result.output).toContain("attic/box");
  });
});

describe("git branch, git checkout, and git switch", () => {
  it("creates and lists branches", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git branch feature").repo;
    const result = runOk(repo, "git branch");
    expect(result.output).toEqual(["  feature", "* main"]);
  });

  it("lists remote-tracking refs after a push", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    const result = runOk(repo, "git branch -a");
    expect(result.output).toEqual(["* main", "  remotes/origin/main"]);
  });

  it("filters by --contains", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "upperdeck/bed", "#00ffff"),
      "upperdeck/bed",
      "Feature bed",
    ).repo;
    const sha = headCommit(repo).id;
    repo = runOk(repo, "git checkout main").repo;
    const result = runOk(repo, `git branch -a --contains ${sha}`);
    expect(result.output).toEqual(["  feature"]);
  });

  it("refuses to delete an unmerged branch with -d but allows -D", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "upperdeck/bed", "#00ffff"),
      "upperdeck/bed",
      "Feature bed",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    const refused = run(repo, "git branch -d feature");
    expect(refused.error).toBe(true);
    expect(refused.output.join("\n")).toContain("not fully merged");
    const removed = runOk(repo, "git branch -D feature");
    expect(removed.output[0]).toMatch(/^Deleted branch feature \(was [0-9a-f]{7}\)\.$/);
  });

  it("switches, creates with -b, and reports detached checkouts", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    expect(headCommit(repo).message).toBe("Initial house");
    const back = runOk(repo, "git checkout main");
    expect(back.output).toEqual(["Switched to branch 'main'"]);
    const again = runOk(back.repo, "git checkout main");
    expect(again.output).toEqual(["Already on 'main'"]);
    const sha = headCommit(repo).id;
    const detached = runOk(repo, `git checkout ${sha}`);
    expect(detached.output[0]).toBe(`Note: switching to '${sha}'.`);
    expect(detached.repo.head.kind).toBe("detached");
  });

  it("switches with git switch and creates with -c", () => {
    const repo = createInitialRepository();
    const created = runOk(repo, "git switch -c lounge");
    expect(created.output).toEqual(["Switched to a new branch 'lounge'"]);
    const back = runOk(created.repo, "git switch main");
    expect(back.output).toEqual(["Switched to branch 'main'"]);
    const refused = run(repo, "git switch feature-that-is-a-sha");
    expect(refused.error).toBe(true);
  });
});

describe("git merge", () => {
  it("fast-forwards to the target branch", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "upperdeck/bed", "#00ffff"),
      "upperdeck/bed",
      "Feature bed",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    const result = runOk(repo, "git merge feature");
    expect(result.output).toEqual(["Fast-forward"]);
    expect(result.repo.working["upperdeck/bed"]?.color).toBe("#00ffff");
  });

  it("creates a merge commit for diverged branches", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug"),
      "lowerdeck/rug",
      "Add rug",
    ).repo;
    repo = runOk(repo, "git checkout -b feature HEAD~1").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "upperdeck/bed", "#00ffff"),
      "upperdeck/bed",
      "Feature bed",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    const result = runOk(repo, "git merge feature");
    expect(result.output).toEqual(["Merge made by the 'ort' strategy."]);
    expect(headCommit(result.repo).parents).toHaveLength(2);
    expect(result.repo.working["lowerdeck/rug"]).toBeDefined();
    expect(result.repo.working["upperdeck/bed"]?.color).toBe("#00ffff");
  });

  it("reports conflicts, resolves with --theirs, and completes the merge", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Feature sofa",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#222222"),
      "lowerdeck/sofa",
      "Main sofa",
    ).repo;
    const conflicted = runOk(repo, "git merge feature");
    const text = conflicted.output.join("\n");
    expect(text).toContain("Auto-merging lowerdeck/sofa");
    expect(text).toContain(
      "CONFLICT (content): Merge conflict in lowerdeck/sofa",
    );
    expect(text).toContain("Automatic merge failed");
    const status = runOk(conflicted.repo, "git status --short");
    expect(status.output).toEqual(["UU lowerdeck/sofa"]);
    const resolved = runOk(conflicted.repo, "git checkout --theirs lowerdeck/sofa");
    expect(resolved.output).toEqual(["Updated 1 path from the index"]);
    expect(resolved.repo.working["lowerdeck/sofa"]?.color).toBe("#111111");
    const done = runOk(resolved.repo, 'git commit -m "Merge feature"');
    expect(done.repo.merge).toBeNull();
    expect(headCommit(done.repo).parents).toHaveLength(2);
  });

  it("aborts a conflicted merge", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Feature sofa",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#222222"),
      "lowerdeck/sofa",
      "Main sofa",
    ).repo;
    const conflicted = run(repo, "git merge feature");
    expect(conflicted.repo.merge).not.toBeNull();
    const aborted = runOk(conflicted.repo, "git merge --abort");
    expect(aborted.repo.merge).toBeNull();
    expect(aborted.repo.working["lowerdeck/sofa"]?.color).toBe("#222222");
    const status = runOk(aborted.repo, "git status");
    expect(status.output.join("\n")).toContain(
      "nothing to commit, working tree clean",
    );
  });
});

describe("git rebase", () => {
  it("replays commits onto the new base", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Feature sofa",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug"),
      "lowerdeck/rug",
      "Add rug",
    ).repo;
    repo = runOk(repo, "git checkout feature").repo;
    const result = runOk(repo, "git rebase main");
    expect(result.output).toEqual([
      "Successfully rebased and updated refs/heads/feature.",
    ]);
    expect(result.repo.working["lowerdeck/rug"]).toBeDefined();
    expect(result.repo.working["lowerdeck/sofa"]?.color).toBe("#111111");
  });

  it("stops on conflicts and finishes with --continue", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Feature sofa",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#222222"),
      "lowerdeck/sofa",
      "Main sofa",
    ).repo;
    repo = runOk(repo, "git checkout feature").repo;
    const conflicted = run(repo, "git rebase main");
    expect(conflicted.output.join("\n")).toContain("could not apply");
    expect(conflicted.repo.rebase).not.toBeNull();
    const resolved = runOk(conflicted.repo, "git checkout --theirs lowerdeck/sofa");
    const done = runOk(resolved.repo, "git rebase --continue");
    expect(done.output).toEqual([
      "Successfully rebased and updated refs/heads/feature.",
    ]);
    expect(done.repo.rebase).toBeNull();
    expect(done.repo.working["lowerdeck/sofa"]?.color).toBe("#111111");
  });

  it("aborts a conflicted rebase back to the snapshot", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#111111"),
      "lowerdeck/sofa",
      "Feature sofa",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#222222"),
      "lowerdeck/sofa",
      "Main sofa",
    ).repo;
    repo = runOk(repo, "git checkout feature").repo;
    const conflicted = run(repo, "git rebase main");
    expect(conflicted.repo.rebase).not.toBeNull();
    const aborted = runOk(conflicted.repo, "git rebase --abort");
    expect(aborted.repo.rebase).toBeNull();
    expect(aborted.repo.working["lowerdeck/sofa"]?.color).toBe("#111111");
    const status = runOk(aborted.repo, "git status --short");
    expect(status.output).toEqual([]);
  });

  it("supports --onto with an explicit base", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git checkout -b feature").repo;
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug", "#abcdef"),
      "lowerdeck/rug",
      "Add colored rug",
    ).repo;
    repo = runOk(repo, "git checkout main").repo;
    repo = stageAndCommit(
      moveArtifact(repo, "lowerdeck/table", [2, 0.4, 0]),
      "lowerdeck/table",
      "Move table",
    ).repo;
    const result = runOk(repo, "git rebase --onto main HEAD~1 feature");
    expect(result.output).toEqual([
      "Successfully rebased and updated refs/heads/feature.",
    ]);
    expect(result.repo.working["lowerdeck/rug"]?.color).toBe("#abcdef");
    expect(result.repo.working["lowerdeck/table"]?.transform.position).toEqual([
      2, 0.4, 0,
    ]);
  });
});

describe("remote commands", () => {
  it("reports a new branch on first push", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git push");
    expect(result.output).toEqual([
      "To https://gittypunk.local/house.git",
      " * [new branch]      main -> main",
    ]);
  });

  it("reports Everything up-to-date on repeat pushes", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    const result = runOk(repo, "git push");
    expect(result.output).toEqual(["Everything up-to-date"]);
  });

  it("reports the update range after a new commit", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    const result = runOk(repo, "git push");
    expect(result.output[0]).toBe("To https://gittypunk.local/house.git");
    expect(result.output[1]).toMatch(
      /^ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> main$/,
    );
  });

  it("rejects non-fast-forward pushes", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo));
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    const result = run(repo, "git push");
    expect(result.error).toBe(true);
    const text = result.output.join("\n");
    expect(text).toContain("[rejected]");
    expect(text).toContain("(non-fast-forward)");
  });

  it("guards force-with-lease behind a fetch", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo));
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    const stale = run(repo, "git push --force-with-lease");
    expect(stale.error).toBe(true);
    expect(stale.output.join("\n")).toContain("(stale info)");
    const fetched = runOk(stale.repo, "git fetch");
    const forced = runOk(fetched.repo, "git push --force-with-lease");
    expect(forced.output[1]).toMatch(
      /^ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> main$/,
    );
  });

  it("prints fetch updates and the diverged status line", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo));
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    const result = runOk(repo, "git fetch");
    expect(result.output[0]).toBe("From https://gittypunk.local/house.git");
    expect(result.output[1]).toMatch(
      /^ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> origin\/main$/,
    );
    const status = runOk(result.repo, "git status");
    expect(status.output.join("\n")).toContain(
      "Your branch and 'origin/main' have diverged,",
    );
  });

  it("lists remotes with -v", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git remote -v");
    expect(result.output).toEqual([
      "origin\thttps://gittypunk.local/house.git (fetch)",
      "origin\thttps://gittypunk.local/house.git (push)",
    ]);
  });

  it("adds remotes and refuses duplicates", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git remote add backup https://gittypunk.local/backup.git").repo;
    expect(repo.remotes["backup"]).toBe("https://gittypunk.local/backup.git");
    const duplicate = run(repo, "git remote add backup https://example.com/x.git");
    expect(duplicate.error).toBe(true);
    expect(duplicate.output.join("\n")).toContain("already exists");
  });

  it("pulls with a merge by default", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo));
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    const result = runOk(repo, "git pull");
    expect(result.output).toEqual(["Merge made by the 'ort' strategy."]);
    expect(headCommit(result.repo).parents).toHaveLength(2);
  });

  it("pulls with a rebase when configured", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git push").repo;
    repo = applyOriginUpdate(repo, colleagueDiverge(repo));
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Local one",
    ).repo;
    repo = runOk(repo, "git config pull.rebase true").repo;
    const result = runOk(repo, "git pull");
    expect(result.output).toEqual([
      "Successfully rebased and updated refs/heads/main.",
    ]);
    expect(headCommit(result.repo).parents).toHaveLength(1);
  });

  it("reads config values back", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git config pull.rebase true").repo;
    const result = runOk(repo, "git config pull.rebase");
    expect(result.output).toEqual(["true"]);
    const missing = run(repo, "git config user.email");
    expect(missing.error).toBe(true);
    expect(missing.output.join("\n")).toContain("has no value");
  });
});

describe("git bundle, git clone, and git filter-repo", () => {
  it("creates a bundle into the execution env", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug"),
      "lowerdeck/rug",
      "Add rug",
    ).repo;
    const env = emptyEnv();
    const result = runOk(repo, "git bundle create ../house-backup.bundle --all", env);
    expect(result.output).toEqual([
      'Created bundle "house-backup.bundle" with 2 commits.',
    ]);
    expect(result.env.bundles["house-backup.bundle"]).toBeDefined();
    const cloned = runOk(repo, "git clone house-backup.bundle", result.env);
    expect(cloned.output).toEqual([
      'Cloning from bundle "house-backup.bundle"...',
      "done.",
    ]);
    expect(headCommit(cloned.repo).message).toBe("Add rug");
  });

  it("refuses to clone an unknown bundle", () => {
    const repo = createInitialRepository();
    const result = run(repo, "git clone no-such.bundle");
    expect(result.error).toBe(true);
    expect(result.output.join("\n")).toContain("could not find bundle");
  });

  it("requires --force for filter-repo", () => {
    const repo = createInitialRepository();
    const result = run(repo, "git filter-repo --invert-paths --path lowerdeck/rug");
    expect(result.error).toBe(true);
    expect(result.output.join("\n")).toContain(
      "refusing to rewrite history without --force",
    );
  });

  it("purges a path from history and clears remote tracking", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      addNewArtifact(repo, "lowerdeck/rug"),
      "lowerdeck/rug",
      "Add rug",
    ).repo;
    repo = stageAndCommit(
      moveArtifact(repo, "lowerdeck/table", [2, 0.4, 0]),
      "lowerdeck/table",
      "Move table",
    ).repo;
    const result = runOk(repo, "git filter-repo --force --invert-paths --path lowerdeck/rug");
    expect(result.output.join("\n")).toMatch(
      /Rewrote \d+ commits? to remove 'lowerdeck\/rug'\./,
    );
    expect(result.repo.working["lowerdeck/rug"]).toBeUndefined();
    expect(result.repo.working["lowerdeck/table"]?.transform.position).toEqual([
      2, 0.4, 0,
    ]);
    expect(result.repo.remoteTracking).toEqual({});
  });

  it("restores files deleted with git rm via unstage or source/checkout options", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git rm lowerdeck/sofa").repo;
    expect(repo.working["lowerdeck/sofa"]).toBeUndefined();
    expect(repo.index["lowerdeck/sofa"]).toBeUndefined();

    // Plain restore gives hint about staged deletion
    const failedRestore = run(repo, "git restore lowerdeck/sofa");
    expect(failedRestore.error).toBe(true);
    expect(failedRestore.output.join("\n")).toContain("staged for deletion");

    // Unstage deletion, then restore working tree
    let restored = runOk(repo, "git restore --staged lowerdeck/sofa").repo;
    expect(restored.index["lowerdeck/sofa"]).toBeDefined();
    restored = runOk(restored, "git restore lowerdeck/sofa").repo;
    expect(restored.working["lowerdeck/sofa"]).toBeDefined();

    // Single command restore --source HEAD or checkout --
    const oneStep = runOk(repo, "git restore -s HEAD lowerdeck/sofa").repo;
    expect(oneStep.working["lowerdeck/sofa"]).toBeDefined();

    const checkedOut = runOk(repo, "git checkout -- lowerdeck/sofa").repo;
    expect(checkedOut.working["lowerdeck/sofa"]).toBeDefined();
  });

  it("allows restoring an artifact deleted in past commits from an older commit source", () => {
    let repo = createInitialRepository();
    repo = runOk(repo, "git rm lowerdeck/chair").repo;
    repo = runOk(repo, 'git commit -m "Removed chair"').repo;
    repo = runOk(repo, "git checkout -b new").repo;

    const failedAdd = run(repo, "git add lowerdeck/chair");
    expect(failedAdd.error).toBe(true);
    expect(failedAdd.output.join("\n")).toContain("did not match any files");

    repo = runOk(repo, "git restore -s HEAD~1 lowerdeck/chair").repo;
    expect(repo.working["lowerdeck/chair"]).toBeDefined();
  });
});

describe("git reset and error handling", () => {
  it("hard resets and reports the new HEAD", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Recolor sofa",
    ).repo;
    const result = runOk(repo, "git reset --hard HEAD~1");
    expect(result.output[0]).toMatch(
      /^HEAD is now at [0-9a-f]{7} Initial house$/,
    );
    expect(result.repo.working["lowerdeck/sofa"]?.color).toBe("#7d9d6a");
  });

  it("soft resets keep the working tree", () => {
    let repo = createInitialRepository();
    repo = stageAndCommit(
      recolorArtifact(repo, "lowerdeck/sofa", "#112233"),
      "lowerdeck/sofa",
      "Recolor sofa",
    ).repo;
    const result = runOk(repo, "git reset --soft HEAD~1");
    expect(result.output).toEqual([]);
    expect(result.repo.working["lowerdeck/sofa"]?.color).toBe("#112233");
    expect(result.repo.index["lowerdeck/sofa"]?.color).toBe("#112233");
  });

  it("reinitializes with git init", () => {
    const repo = createInitialRepository();
    const result = runOk(repo, "git init");
    expect(result.output).toEqual([
      "Reinitialized existing GittyPunk repository in the house",
    ]);
  });

  it("rejects unknown commands like real git", () => {
    const repo = createInitialRepository();
    const result = run(repo, "git frobnicate");
    expect(result.output).toEqual([
      "git: 'frobnicate' is not a git command. See 'git --help'.",
    ]);
    expect(result.error).toBe(true);
  });

  it("rejects unknown flags with a usage line", () => {
    const repo = createInitialRepository();
    const result = run(repo, "git rm --bogus lowerdeck/table");
    expect(result.error).toBe(true);
    expect(result.output[0]).toBe("error: unknown option `bogus'");
    expect(result.output[1]).toContain("usage: git rm");
  });

  it("requires the git prefix", () => {
    const repo = createInitialRepository();
    const result = run(repo, "status --short");
    expect(result.error).toBe(true);
    expect(result.output[0]).toContain("fatal:");
  });

  it("ignores blank input", () => {
    const repo = createInitialRepository();
    const result = run(repo, "   ");
    expect(result.output).toEqual([]);
    expect(result.error).toBe(false);
  });
});
