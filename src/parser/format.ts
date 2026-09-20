import { currentBranch } from "../engine";
import type {
  Artifact,
  Commit,
  Conflict,
  DiffEntry,
  MergeOutcome,
  RebaseOutcome,
  RepoStatus,
  Repository,
  StatusEntry,
  Vec3,
} from "../engine";

export function abbreviate(id: string): string {
  return id.slice(0, 7);
}

function formatVec(vec: Vec3): string {
  return `[${vec.join(", ")}]`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

type FieldName =
  | "position"
  | "rotation"
  | "scale"
  | "color"
  | "visible"
  | "kind";

const FIELD_ORDER: FieldName[] = [
  "position",
  "rotation",
  "scale",
  "color",
  "visible",
  "kind",
];

const FIELD_READERS: Record<FieldName, (artifact: Artifact) => string> = {
  position: (artifact) => formatVec(artifact.transform.position),
  rotation: (artifact) => formatVec(artifact.transform.rotation),
  scale: (artifact) => formatVec(artifact.transform.scale),
  color: (artifact) => artifact.color,
  visible: (artifact) => String(artifact.visible),
  kind: (artifact) => artifact.kind,
};

function fieldsOf(entry: DiffEntry): FieldName[] {
  if (entry.before && entry.after) {
    return entry.fields.filter((field): field is FieldName =>
      FIELD_ORDER.includes(field as FieldName),
    );
  }
  return FIELD_ORDER;
}

export function formatDiffEntry(entry: DiffEntry): string[] {
  const lines = [`diff --git a/${entry.path} b/${entry.path}`];
  if (!entry.before) lines.push(`new artifact ${entry.path}`);
  if (!entry.after) lines.push(`deleted artifact ${entry.path}`);
  lines.push(entry.before ? `--- a/${entry.path}` : "--- /dev/null");
  lines.push(entry.after ? `+++ b/${entry.path}` : "+++ /dev/null");
  for (const field of fieldsOf(entry)) {
    lines.push(`@@ ${field} @@`);
    if (entry.before) lines.push(`-${FIELD_READERS[field](entry.before)}`);
    if (entry.after) lines.push(`+${FIELD_READERS[field](entry.after)}`);
  }
  return lines;
}

export function formatDiff(entries: DiffEntry[]): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(...formatDiffEntry(entry));
  }
  return lines;
}

export function formatDiffStat(entries: DiffEntry[]): string[] {
  if (entries.length === 0) return [];
  const lines = entries.map((entry) =>
    entry.before && entry.after
      ? ` ${entry.path} | ${entry.fields.join(", ")}`
      : ` ${entry.path} | ${entry.after ? "new artifact" : "removed"}`,
  );
  lines.push("", ` ${countLabel(entries.length, "artifact")} changed`);
  return lines;
}

function stagedCode(entry: StatusEntry): string {
  if (entry.staged === "added") return "A";
  if (entry.staged === "modified") return "M";
  if (entry.staged === "removed") return "D";
  return " ";
}

function worktreeCode(entry: StatusEntry): string {
  if (entry.worktree === "conflict") return "U";
  if (entry.worktree === "untracked") return "?";
  if (entry.worktree === "added") return "A";
  if (entry.worktree === "modified") return "M";
  if (entry.worktree === "removed") return "D";
  return " ";
}

export function formatStatusShort(status: RepoStatus): string[] {
  return status.entries.map((entry) => {
    if (entry.worktree === "untracked" && entry.staged === null) {
      return `?? ${entry.path}`;
    }
    if (entry.worktree === "conflict") {
      return `UU ${entry.path}`;
    }
    return `${stagedCode(entry)}${worktreeCode(entry)} ${entry.path}`;
  });
}

function conflictLabel(conflict: Conflict): string {
  if (conflict.kind === "add-add") return "both added:";
  if (conflict.kind === "both-modified") return "both modified:";
  return conflict.ours ? "deleted by them:" : "deleted by us:";
}

export function formatStatusLong(
  repo: Repository,
  status: RepoStatus,
): string[] {
  const lines: string[] = [];
  if (status.detached) {
    const commitId = repo.head.kind === "detached" ? repo.head.commit : "";
    const commit = repo.commits[commitId];
    lines.push(
      `HEAD detached at ${abbreviate(commitId)} ${commit?.message ?? ""}`.trimEnd(),
    );
  } else {
    lines.push(`On branch ${status.branch}`);
  }
  const branch = status.branch;
  if (branch && status.ahead > 0 && status.behind > 0) {
    lines.push(
      `Your branch and 'origin/${branch}' have diverged,`,
      `and have ${countLabel(status.ahead, "commit")} and ${countLabel(status.behind, "commit")} different commits each, respectively.`,
    );
  } else if (branch && status.ahead > 0) {
    lines.push(
      `Your branch is ahead of 'origin/${branch}' by ${countLabel(status.ahead, "commit")}.`,
    );
    lines.push('  (use "git push" to publish your local commits)');
  } else if (branch && status.behind > 0) {
    lines.push(
      `Your branch is behind 'origin/${branch}' by ${countLabel(status.behind, "commit")}, and can be fast-forwarded.`,
    );
    lines.push('  (use "git pull" to update your local branch)');
  }
  if (status.merging) {
    lines.push("You have unmerged paths.");
    lines.push('  (fix conflicts and run "git commit")');
  }
  if (status.rebasing) {
    const rebaseBranch = repo.rebase?.branch;
    lines.push(
      rebaseBranch
        ? `You are currently rebasing branch '${rebaseBranch}'.`
        : "You are currently rebasing.",
    );
    lines.push('  (fix conflicts and then run "git rebase --continue")');
  }
  const conflicts = repo.merge?.conflicts ?? repo.rebase?.conflicts ?? [];
  const conflictPaths = new Set(conflicts.map((conflict) => conflict.path));
  const staged = status.entries.filter(
    (entry) => entry.staged !== null && !conflictPaths.has(entry.path),
  );
  const unstaged = status.entries.filter(
    (entry) =>
      entry.worktree === "modified" || entry.worktree === "removed",
  );
  const untracked = status.entries.filter(
    (entry) => entry.worktree === "untracked" && entry.staged === null,
  );
  if (conflicts.length > 0) {
    lines.push(
      "",
      "Unmerged paths:",
      '  (use "git add <file>..." to mark resolution)',
    );
    for (const conflict of conflicts) {
      lines.push(`\t${conflictLabel(conflict).padEnd(17)}${conflict.path}`);
    }
  }
  if (staged.length > 0) {
    lines.push(
      "",
      "Changes to be committed:",
      '  (use "git restore --staged <file>..." to unstage)',
    );
    for (const entry of staged) {
      const label =
        entry.staged === "added"
          ? "new file:"
          : entry.staged === "removed"
            ? "deleted:"
            : "modified:";
      lines.push(`\t${label.padEnd(12)}${entry.path}`);
    }
  }
  if (unstaged.length > 0) {
    lines.push(
      "",
      "Changes not staged for commit:",
      '  (use "git add <file>..." to update what will be committed)',
    );
    for (const entry of unstaged) {
      const label = entry.worktree === "removed" ? "deleted:" : "modified:";
      lines.push(`\t${label.padEnd(12)}${entry.path}`);
    }
  }
  if (untracked.length > 0) {
    lines.push(
      "",
      "Untracked files:",
      '  (use "git add <file>..." to include in what will be committed)',
    );
    for (const entry of untracked) {
      lines.push(`\t${entry.path}`);
    }
  }
  const changedCount = staged.length + unstaged.length + conflicts.length;
  if (changedCount > 0) {
    if (staged.length === 0 && conflicts.length === 0) {
      lines.push(
        "",
        'no changes added to commit (use "git add" and/or "git commit -a")',
      );
    }
  } else if (untracked.length > 0) {
    lines.push(
      "",
      'nothing added to commit but untracked files present (use "git add" to track)',
    );
  } else {
    lines.push("", "nothing to commit, working tree clean");
  }
  return lines;
}

export function formatLogOneline(commit: Commit): string {
  return `${abbreviate(commit.id)} ${commit.message}`;
}

export function formatLogFull(commit: Commit): string[] {
  const lines = [`commit ${commit.id}`];
  if (commit.parents.length > 1) {
    lines.push(`Merge: ${commit.parents.map(abbreviate).join(" ")}`);
  }
  lines.push(`Author: ${commit.author}`);
  lines.push(`Date:   house-time ${commit.timestamp}`);
  lines.push("");
  for (const line of commit.message.split("\n")) {
    lines.push(`    ${line}`);
  }
  lines.push("");
  return lines;
}

export function commitSummary(
  label: string,
  commit: Commit,
  changed: number,
): string[] {
  return [
    `[${label}] ${commit.message}`,
    ` ${countLabel(changed, "artifact")} changed`,
  ];
}

export function formatMergeOutcome(outcome: MergeOutcome): string[] {
  if (outcome.alreadyUpToDate) return ["Already up to date."];
  if (outcome.fastForward) return ["Fast-forward"];
  if (outcome.conflicts.length > 0) {
    const lines: string[] = [];
    for (const conflict of outcome.conflicts) {
      if (conflict.kind === "both-modified") {
        lines.push(`Auto-merging ${conflict.path}`);
      }
      const kind =
        conflict.kind === "add-add"
          ? "add/add"
          : conflict.kind === "modify-delete"
            ? "modify/delete"
            : "content";
      lines.push(`CONFLICT (${kind}): Merge conflict in ${conflict.path}`);
    }
    lines.push(
      "Automatic merge failed; fix conflicts and then commit the result.",
    );
    return lines;
  }
  return ["Merge made by the 'ort' strategy."];
}

export function formatRebaseOutcome(outcome: RebaseOutcome): string[] {
  const branch = currentBranch(outcome.repo) ?? "detached HEAD";
  if (outcome.alreadyUpToDate) {
    return [`Current branch ${branch} is up to date.`];
  }
  if (outcome.conflicts.length > 0) {
    const lines: string[] = [];
    const queue = outcome.repo.rebase?.queue ?? [];
    const original =
      queue.length > 0 ? outcome.repo.commits[queue[0] ?? ""] : undefined;
    if (original) {
      lines.push(
        `error: could not apply ${abbreviate(original.id)}... ${original.message}`,
      );
    }
    lines.push(
      "hint: Resolve the conflicts, then run 'git rebase --continue'.",
    );
    return lines;
  }
  if (outcome.fastForward) {
    return [`Fast-forwarded ${branch} to the new base.`];
  }
  return [`Successfully rebased and updated refs/heads/${branch}.`];
}

export function formatPushUpdate(
  url: string,
  branch: string,
  oldId: string | undefined,
  newId: string,
): string[] {
  if (oldId === undefined) {
    return [`To ${url}`, ` * [new branch]      ${branch} -> ${branch}`];
  }
  return [
    `To ${url}`,
    `   ${abbreviate(oldId)}..${abbreviate(newId)}  ${branch} -> ${branch}`,
  ];
}

export function formatFetchUpdate(
  branch: string,
  oldId: string | undefined,
  newId: string,
): string {
  if (oldId === undefined) {
    return ` * [new branch]         ${branch} -> origin/${branch}`;
  }
  return `   ${abbreviate(oldId)}..${abbreviate(newId)}  ${branch} -> origin/${branch}`;
}
