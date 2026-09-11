import { describe, expect, it } from "vitest";
import { createCommitLock } from "../lib/commit-lock";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("createCommitLock", () => {
  it("runs tasks one at a time, in submission order", async () => {
    const lock = createCommitLock();
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`start:${name}`);
      await delay(ms);
      events.push(`end:${name}`);
    };
    await Promise.all([lock(task("a", 20)), lock(task("b", 5)), lock(task("c", 1))]);
    expect(events).toEqual(["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
  });

  it("gives each task a settled view of the previous task's writes", async () => {
    const lock = createCommitLock();
    let value = 0;
    await Promise.all([
      lock(async () => {
        await delay(5);
        value = 1;
      }),
      lock(async () => {
        if (value !== 1) throw new Error("task ran before the previous one settled");
      }),
    ]);
  });

  it("rejects a failing task to its own caller without breaking the chain", async () => {
    const lock = createCommitLock();
    const boom = lock(async () => {
      throw new Error("boom");
    });
    const after = lock(async () => "ok");
    await expect(boom).rejects.toThrow("boom");
    await expect(after).resolves.toBe("ok");
  });
});
