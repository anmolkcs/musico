/**
 * Serializes mutations of the native playback queue (lib/player.ts).
 *
 * The native TrackPlayer queue and the store that mirrors it are updated
 * asynchronously and independently, so two overlapping operations (a
 * playQueue commit racing an enqueue, two queue swaps, ...) must never
 * interleave their bridge calls — the queue would end up matching neither
 * caller. Tasks submitted here run strictly one at a time, in submission
 * order, and each task sees the settled result of the previous one.
 *
 * Long-running work (stream resolution) must happen BEFORE a task is
 * submitted: the lock is held for the whole task, so tasks re-validate
 * their preconditions instead of waiting on network I/O.
 *
 * A failing task rejects its own caller only — the chain keeps running and
 * later tasks still execute.
 */
export type CommitTask<T> = () => Promise<T>;

export function createCommitLock() {
  let chain: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: CommitTask<T>): Promise<T> {
    const run = chain.then(task);
    // Keep the chain alive regardless of task failures.
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
