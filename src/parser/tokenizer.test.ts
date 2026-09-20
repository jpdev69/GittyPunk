import { describe, expect, it } from "vitest";
import { GitError } from "../engine";
import { tokenize } from "./tokenizer";

describe("tokenize", () => {
  it("splits on runs of whitespace", () => {
    expect(tokenize("git   status \t --short")).toEqual([
      "git",
      "status",
      "--short",
    ]);
  });

  it("keeps quoted phrases as one token", () => {
    expect(tokenize('git commit -m "Move the table"')).toEqual([
      "git",
      "commit",
      "-m",
      "Move the table",
    ]);
  });

  it("supports single quotes", () => {
    expect(tokenize("git commit -m 'Hide the lamp'")).toEqual([
      "git",
      "commit",
      "-m",
      "Hide the lamp",
    ]);
  });

  it("preserves empty quoted messages", () => {
    expect(tokenize('git commit -m ""')).toEqual(["git", "commit", "-m", ""]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => tokenize('git commit -m "oops')).toThrow(GitError);
  });

  it("returns nothing for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});
