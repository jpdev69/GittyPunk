import { describe, beforeEach, expect, it } from "vitest";
import { createInitialRepository } from "../engine";
import { emptyEnv } from "../parser";
import { useAppStore } from "./store";

function resetStore() {
  useAppStore.setState({
    repo: createInitialRepository(),
    env: emptyEnv(),
    lines: [],
    selected: null,
    focused: null,
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
});
