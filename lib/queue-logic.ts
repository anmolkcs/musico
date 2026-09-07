import type { RepeatMode } from "../store/queue";

export type QueueIndexInput = {
  length: number;
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

/**
 * Index of the next track. Returns -1 when playback should stop
 * (end of queue with repeat "off" during an automatic advance).
 *
 * Note: repeat "track" replays the same track when it ENDS (handled by the
 * queue-ended path, not here); this function models advancing, where
 * "track" behaves like "off".
 */
export function nextIndex(q: QueueIndexInput, auto: boolean): number {
  const { length, index, shuffle, repeat } = q;
  if (length === 0) return -1;
  if (length === 1) {
    // Shuffle keeps a single track looping; otherwise auto-advance stops.
    if (!shuffle && repeat === "off" && auto) return -1;
    return 0;
  }
  if (shuffle) {
    let next = index;
    while (next === index) next = Math.floor(Math.random() * length);
    return next;
  }
  if (index + 1 < length) return index + 1;
  if (repeat === "queue") return 0;
  if (auto) return -1;
  return index; // manual next at end without queue repeat restarts current
}

/** Index of the previous track (wraps around). Returns -1 for an empty queue. */
export function prevIndex(q: QueueIndexInput): number {
  const { length, index } = q;
  if (length === 0) return -1;
  if (index - 1 >= 0) return index - 1;
  return length - 1;
}
