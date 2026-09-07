/** Pure formatting helpers (no React Native / Expo imports — safe for unit tests). */

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** File extension for a stream container name reported by the extractor. */
export function extFor(format: string): string {
  if (format === "webm" || format === "webma") return "webm";
  if (format === "ogg" || format === "opus") return "ogg";
  return "m4a";
}

export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
