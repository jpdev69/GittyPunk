import { describe, expect, it } from "vitest";
import { lerpFactor, stepToward } from "./tween";

describe("lerpFactor", () => {
  it("returns 0 for zero delta", () => {
    expect(lerpFactor(0, 6)).toBe(0);
  });

  it("approaches 1 as delta grows", () => {
    const small = lerpFactor(0.016, 6);
    const large = lerpFactor(1, 6);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(1);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(1);
  });

  it("higher speed converges faster", () => {
    expect(lerpFactor(0.1, 20)).toBeGreaterThan(lerpFactor(0.1, 5));
  });
});

describe("stepToward", () => {
  it("moves current toward target but never overshoots", () => {
    const next = stepToward(0, 10, 0.1, 6);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it("stays put when already at target", () => {
    expect(stepToward(5, 5, 0.1, 6)).toBe(5);
  });

  it("handles zero delta", () => {
    expect(stepToward(1, 9, 0, 6)).toBe(1);
  });

  it("converges over repeated steps", () => {
    let value = 0;
    for (let i = 0; i < 120; i += 1) {
      value = stepToward(value, 10, 1 / 60, 6);
    }
    expect(value).toBeGreaterThan(9.9);
    expect(value).toBeLessThanOrEqual(10);
  });
});
