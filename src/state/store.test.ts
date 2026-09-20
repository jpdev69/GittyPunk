import { describe, beforeEach, expect, it } from "vitest";
import { createInitialRepository } from "../engine";
import { recolorArtifact, stageAndCommit } from "../engine/test-support";
import { emptyEnv } from "../parser";
import { useAppStore } from "./store";

function resetStore() {
  useAppStore.setState({
    repo: createInitialRepository(),
    env: emptyEnv(),
    lines: [],
    selected: null,
    focused: null,
    viewMode: "working",
    flash: null,
    travelCommit: null,
    diffView: null,
  });
}

describe("app store", () => {
  beforeEach(resetStore);

  it("starts with the initial house as the working tree", () => {
    const { repo } = useAppStore.getState();
    expect(Object.keys(repo.working)).toHaveLength(21);
  });

  it("runs git commands through the parser and swaps in the new repo", () => {
    useAppStore.getState().runCommand("git rm table");
    const { repo, lines } = useAppStore.getState();
    expect(repo.working["middledeck/table"]).toBeUndefined();
    expect(lines.at(-2)?.kind).toBe("input");
    expect(lines.at(-2)?.text).toBe("git rm table");
    expect(lines.at(-1)?.kind).toBe("output");
    expect(lines.at(-1)?.text).toBe("rm 'middledeck/table'");
  });

  it("marks failed commands as error lines", () => {
    useAppStore.getState().runCommand("git frobnicate");
    const { lines } = useAppStore.getState();
    expect(lines.at(-1)?.kind).toBe("error");
    expect(lines.at(-1)?.text).toContain("is not a git command");
  });

  it("commits changes typed into the terminal", () => {
    useAppStore.getState().runCommand("git rm table");
    useAppStore.getState().runCommand('git commit -m "Remove table"');
    const { repo } = useAppStore.getState();
    expect(Object.keys(repo.commits)).toHaveLength(2);
    expect(repo.commits[repo.branches["main"] ?? ""]?.message).toBe(
      "Remove table",
    );
  });

  it("tracks selection and deck focus", () => {
    const { select, focusDeck } = useAppStore.getState();
    select("middledeck/sofa");
    focusDeck("upperdeck");
    const selected = useAppStore.getState();
    expect(selected.selected).toBe("middledeck/sofa");
    expect(selected.focused).toBe("upperdeck");
    select(null);
    focusDeck(null);
    expect(useAppStore.getState().selected).toBeNull();
    expect(useAppStore.getState().focused).toBeNull();
  });

  it("toggles the three view modes", () => {
    expect(useAppStore.getState().viewMode).toBe("working");
    useAppStore.getState().setViewMode("blueprint");
    expect(useAppStore.getState().viewMode).toBe("blueprint");
    useAppStore.getState().setViewMode("snapshot");
    expect(useAppStore.getState().viewMode).toBe("snapshot");
    useAppStore.getState().setViewMode("working");
    expect(useAppStore.getState().viewMode).toBe("working");
  });

  it("flashes stage feedback for staging commands", () => {
    useAppStore.getState().runCommand("git rm table");
    const flash = useAppStore.getState().flash;
    expect(flash?.kind).toBe("stage");
    expect(flash?.message).toBe("Blueprint updated");
    expect(flash?.at).toBeGreaterThan(0);
  });

  it("flashes commit feedback with the snapshot message", () => {
    useAppStore.getState().runCommand("git rm table");
    useAppStore.getState().runCommand('git commit -m "Remove table"');
    const flash = useAppStore.getState().flash;
    expect(flash?.kind).toBe("commit");
    expect(flash?.message).toBe("Snapshot frozen: Remove table");
  });

  it("flashes error feedback for failed commands", () => {
    useAppStore.getState().runCommand("git frobnicate");
    const flash = useAppStore.getState().flash;
    expect(flash?.kind).toBe("error");
    expect(flash?.message).toContain("is not a git command");
  });

  it("flashes reset feedback for git reset", () => {
    useAppStore.getState().runCommand("git rm table");
    useAppStore.getState().runCommand("git reset --hard");
    const flash = useAppStore.getState().flash;
    expect(flash?.kind).toBe("reset");
    expect(flash?.message).toBe("House rolled back");
  });

  it("flashes conflict feedback when a merge stops on conflicts", () => {
    useAppStore.getState().runCommand("git checkout -b feature");
    let repo = useAppStore.getState().repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#111111"),
      "middledeck/sofa",
      "Feature sofa",
    ).repo;
    useAppStore.setState({ repo });
    useAppStore.getState().runCommand("git checkout main");
    repo = useAppStore.getState().repo;
    repo = stageAndCommit(
      recolorArtifact(repo, "middledeck/sofa", "#222222"),
      "middledeck/sofa",
      "Main sofa",
    ).repo;
    useAppStore.setState({ repo });
    useAppStore.getState().runCommand("git merge feature");

    const { flash, lines } = useAppStore.getState();
    expect(flash?.kind).toBe("conflict");
    expect(flash?.message).toBe("Conflicts - resolve the glowing artifacts");
    expect(
      lines.some((line) => line.text.includes("CONFLICT (content)")),
    ).toBe(true);
  });

  it("tracks time travel to a commit snapshot", () => {
    useAppStore.getState().runCommand("git rm table");
    useAppStore.getState().runCommand('git commit -m "Remove table"');
    const history = useAppStore.getState().repo.commits;
    const firstCommit = Object.values(history).find(
      (commit) => commit.message === "Initial house",
    );

    useAppStore.getState().setTravelCommit(firstCommit?.id ?? "");
    expect(useAppStore.getState().travelCommit).toBe(firstCommit?.id ?? "");

    useAppStore.getState().runCommand("git frobnicate");
    expect(useAppStore.getState().travelCommit).toBe(firstCommit?.id ?? "");

    useAppStore.getState().runCommand("git status");
    expect(useAppStore.getState().travelCommit).toBeNull();

    useAppStore.getState().setTravelCommit(firstCommit?.id ?? "");
    useAppStore.getState().setViewMode("snapshot");
    expect(useAppStore.getState().travelCommit).toBeNull();

    useAppStore.getState().setTravelCommit(firstCommit?.id ?? "");
    useAppStore.getState().setTravelCommit(null);
    expect(useAppStore.getState().travelCommit).toBeNull();
  });

  it("opens the compare view for git diff forms", () => {
    useAppStore.getState().runCommand("git rm table");
    useAppStore.getState().runCommand('git commit -m "Remove table"');

    useAppStore.getState().runCommand("git diff");
    expect(useAppStore.getState().diffView).toEqual({
      from: "index",
      to: "working",
    });

    useAppStore.getState().runCommand("git diff --cached");
    expect(useAppStore.getState().diffView).toEqual({
      from: "HEAD",
      to: "index",
    });

    useAppStore.getState().runCommand("git diff HEAD~1 HEAD");
    expect(useAppStore.getState().diffView).toEqual({
      from: "HEAD~1",
      to: "HEAD",
    });

    useAppStore.getState().runCommand("git diff main");
    expect(useAppStore.getState().diffView).toEqual({
      from: "main",
      to: "working",
    });
  });

  it("keeps the compare view on failed commands and closes it on new context", () => {
    useAppStore.getState().runCommand("git diff");
    const open = useAppStore.getState().diffView;
    expect(open).toEqual({ from: "index", to: "working" });

    useAppStore.getState().runCommand("git diff bogus-rev");
    expect(useAppStore.getState().diffView).toEqual(open);

    useAppStore.getState().runCommand("git status");
    expect(useAppStore.getState().diffView).toBeNull();

    useAppStore.getState().runCommand("git diff");
    useAppStore.getState().closeDiff();
    expect(useAppStore.getState().diffView).toBeNull();
  });
});
