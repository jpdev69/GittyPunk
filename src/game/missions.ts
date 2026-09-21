import {
  applyOriginUpdate,
  bundleCreate,
  cloneFromBundle,
  commit,
  createInitialRepository,
  getStatus,
  headCommit,
  push,
  removeTracked,
} from "../engine";
import type { Repository } from "../engine";
import {
  moveArtifact,
  recolorArtifact,
  stageAndCommit,
} from "../engine/test-support";
import type { ExecutionEnv } from "../parser";

export interface Mission {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  setup: (repo: Repository, env: ExecutionEnv) => { repo: Repository; env: ExecutionEnv };
  isCompleted: (repo: Repository, env: ExecutionEnv) => boolean;
}

export const TUTORIAL_MISSION: Mission = {
  id: "tutorial",
  title: "Tutorial — Your First Push",
  description:
    "Learn the core Git workflow: check status, stage your changes, commit a snapshot, and push to origin.",
  instructions: [
    "Type 'git status' to inspect modified house artifacts.",
    "Type 'git add lowerdeck/sofa' to stage the sofa into the blueprint.",
    "Type 'git commit -m \"Recolor sofa\"' to freeze a snapshot.",
    "Type 'git push' to sync your snapshot with origin.",
  ],
  setup: (_repo, env) => {
    let next = createInitialRepository();
    next = runPush(next);
    next = recolorArtifact(next, "lowerdeck/sofa", "#ff0088");
    return { repo: next, env };
  },
  isCompleted: (repo) => {
    const head = headCommit(repo);
    const pushed = repo.origin.branches["main"] === head.id;
    return head.message !== "Initial house" && pushed && getStatus(repo).clean;
  },
};

export const MISSIONS: Mission[] = [
  {
    id: "clean_tree",
    title: "Mission 1 — Clean the Tree",
    description:
      "A colleague left modified artifacts in your working house! Stage and commit them to clean the tree.",
    instructions: [
      "Check working house differences with 'git status'.",
      "Stage modified artifacts with 'git add .', or stage individually.",
      "Commit your changes with 'git commit -m \"Clean tree\"'.",
    ],
    setup: (_repo, env) => {
      let next = createInitialRepository();
      next = runPush(next);
      next = recolorArtifact(next, "lowerdeck/chair", "#00bbff");
      next = moveArtifact(next, "lowerdeck/table", [0, 0.4, 0.8]);
      return { repo: next, env };
    },
    isCompleted: (repo) => {
      const head = headCommit(repo);
      return head.message !== "Initial house" && getStatus(repo).clean;
    },
  },
  {
    id: "remove_roof",
    title: "Mission 2 — Remove the Roof",
    description:
      "Renovation time! Remove the roof with 'git rm', commit, and push to update the remote house.",
    instructions: [
      "Remove the roof with 'git rm structural/roof'.",
      "Commit the deletion with 'git commit -m \"Remove roof\"'.",
      "Sync with origin using 'git push'.",
    ],
    setup: (_repo, env) => {
      let next = createInitialRepository();
      next = runPush(next);
      return { repo: next, env };
    },
    isCompleted: (repo) => {
      const originTip = repo.origin.branches["main"];
      const originCommit = originTip ? repo.origin.commits[originTip] : undefined;
      const roofGone = originCommit ? !originCommit.tree["structural/roof"] : false;
      return roofGone && getStatus(repo).clean;
    },
  },
  {
    id: "rewind",
    title: "Mission 3 — Rewind History",
    description:
      "Oh no! Someone deleted the upperdeck bed in a bad commit. Use 'git reset --hard HEAD~1' to recover it!",
    instructions: [
      "Inspect recent commits with 'git log'.",
      "Run 'git reset --hard HEAD~1' to rewind back to before the bad commit.",
      "Verify the bed is restored on the upperdeck.",
    ],
    setup: (_repo, env) => {
      let next = createInitialRepository();
      next = runPush(next);
      next = removeTracked(next, "upperdeck/bed", { cached: false });
      next = commit(next, { message: "Accidental bed deletion" }).repo;
      return { repo: next, env };
    },
    isCompleted: (repo) => {
      return (
        repo.working["upperdeck/bed"] !== undefined && getStatus(repo).clean
      );
    },
  },
  {
    id: "incoming_conflict",
    title: "Mission 4 — Incoming Conflict",
    description:
      "Origin has a conflicting sofa change! Run 'git pull', resolve the conflict, and commit.",
    instructions: [
      "Run 'git pull' to fetch and merge origin changes.",
      "Resolve the conflict using 'git checkout --ours lowerdeck/sofa' or '--theirs'.",
      "Complete the merge with 'git commit -m \"Resolved conflict\"'.",
    ],
    setup: (_repo, env) => {
      let next = createInitialRepository();
      next = runPush(next);

      // Colleague pushes red sofa to origin
      let colleague = cloneFromBundle(bundleCreate(next));
      colleague = stageAndCommit(
        recolorArtifact(colleague, "lowerdeck/sofa", "#ff0000"),
        "lowerdeck/sofa",
        "Colleague red sofa",
      ).repo;
      colleague = push(colleague).repo;
      next = applyOriginUpdate(next, colleague.origin);

      // Local commits blue sofa
      next = stageAndCommit(
        recolorArtifact(next, "lowerdeck/sofa", "#0000ff"),
        "lowerdeck/sofa",
        "Local blue sofa",
      ).repo;

      return { repo: next, env };
    },
    isCompleted: (repo) => {
      const head = headCommit(repo);
      return (
        repo.merge === null &&
        head.parents.length === 2 &&
        getStatus(repo).clean
      );
    },
  },
  {
    id: "backup_day",
    title: "Mission 5 — Backup Day",
    description:
      "Create a full backup bundle of your house using 'git bundle create house.bundle --all'.",
    instructions: [
      "Run 'git bundle create house.bundle --all' to save your house bundle.",
    ],
    setup: (_repo, env) => {
      let next = createInitialRepository();
      next = runPush(next);
      return { repo: next, env };
    },
    isCompleted: (_repo, env) => {
      return env.bundles["house.bundle"] !== undefined;
    },
  },
  {
    id: "purge_past",
    title: "Mission 6 — Purge the Past",
    description:
      "A sensitive TV artifact was committed. Purge 'lowerdeck/tv' from all history using 'git filter-repo'.",
    instructions: [
      "Run 'git filter-repo --force --invert-paths --path lowerdeck/tv' to rewrite history.",
    ],
    setup: (_repo, env) => {
      let next = createInitialRepository();
      next = stageAndCommit(
        recolorArtifact(next, "lowerdeck/tv", "#000000"),
        "lowerdeck/tv",
        "Sensitive tv data",
      ).repo;
      next = runPush(next);
      return { repo: next, env };
    },
    isCompleted: (repo) => {
      for (const commitObj of Object.values(repo.commits)) {
        if (commitObj.tree["lowerdeck/tv"]) return false;
      }
      return true;
    },
  },
];

function runPush(repo: Repository): Repository {
  return push(repo).repo;
}
