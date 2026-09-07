import { describe, expect, it } from "vitest";
import { nextIndex, prevIndex } from "../lib/queue-logic";

const q = (over: Partial<{ length: number; index: number; shuffle: boolean; repeat: "off" | "track" | "queue" }>) => ({
  length: 5,
  index: 0,
  shuffle: false,
  repeat: "off" as const,
  ...over,
});

describe("nextIndex", () => {
  it("advances sequentially", () => {
    expect(nextIndex(q({ index: 0 }), false)).toBe(1);
    expect(nextIndex(q({ index: 3 }), true)).toBe(4);
  });

  it("wraps with queue repeat", () => {
    expect(nextIndex(q({ index: 4, repeat: "queue" }), true)).toBe(0);
    expect(nextIndex(q({ index: 4, repeat: "queue" }), false)).toBe(0);
  });

  it("stops at the end of the queue with repeat off when automatic", () => {
    expect(nextIndex(q({ index: 4 }), true)).toBe(-1);
  });

  it("restarts current track on manual next at the end with repeat off", () => {
    expect(nextIndex(q({ index: 4 }), false)).toBe(4);
  });

  it("repeat track advances like off here (end-of-track repeat is handled by the queue-ended path)", () => {
    expect(nextIndex(q({ index: 2, repeat: "track" }), true)).toBe(3);
    expect(nextIndex(q({ index: 4, repeat: "track" }), true)).toBe(-1);
  });

  it("single-track queue: stops on auto with repeat off, replays otherwise", () => {
    expect(nextIndex(q({ length: 1, index: 0 }), true)).toBe(-1);
    expect(nextIndex(q({ length: 1, index: 0 }), false)).toBe(0);
    expect(nextIndex(q({ length: 1, index: 0, repeat: "track" }), true)).toBe(0);
    expect(nextIndex(q({ length: 1, index: 0, repeat: "queue" }), true)).toBe(0);
  });

  it("returns -1 for an empty queue", () => {
    expect(nextIndex(q({ length: 0, index: 0 }), true)).toBe(-1);
  });

  it("shuffle never returns the current index (multi-track queue)", () => {
    for (let i = 0; i < 50; i++) {
      const next = nextIndex(q({ index: 2, shuffle: true }), true);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(5);
      expect(next).not.toBe(2);
    }
  });

  it("shuffle with a single track returns 0", () => {
    expect(nextIndex(q({ length: 1, index: 0, shuffle: true }), true)).toBe(0);
  });
});

describe("prevIndex", () => {
  it("steps back and wraps", () => {
    expect(prevIndex(q({ index: 3 }))).toBe(2);
    expect(prevIndex(q({ index: 0 }))).toBe(4);
  });

  it("returns -1 for an empty queue", () => {
    expect(prevIndex(q({ length: 0, index: 0 }))).toBe(-1);
  });
});
