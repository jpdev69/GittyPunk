import { describe, expect, it } from "vitest";
import { useAppStore } from "./store";

describe("app store", () => {
  it("starts with the engine marked ready", () => {
    expect(useAppStore.getState().engineReady).toBe(true);
  });
});
