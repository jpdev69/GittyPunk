import { describe, expect, it } from "vitest";
import { canonicalize, shaOf } from "./hash";

describe("canonicalize", () => {
  it("is key-order independent", () => {
    expect(canonicalize({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      canonicalize({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });

  it("serializes primitives distinctly", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize("x")).toBe('"x"');
    expect(canonicalize(0)).toBe("0");
  });
});

describe("shaOf", () => {
  it("is deterministic and eight hex chars", () => {
    const first = shaOf({ message: "Initial house" });
    expect(first).toBe(shaOf({ message: "Initial house" }));
    expect(first).toMatch(/^[0-9a-f]{8}$/);
  });

  it("differs for different content", () => {
    expect(shaOf({ a: 1 })).not.toBe(shaOf({ a: 2 }));
  });
});
