export type Song = {
  id: string; // YouTube video id
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnail: string;
  type?: "song" | "artist" | "album";
};

export type Playlist = {
  id: number;
  name: string;
  createdAt: number;
  count: number;
};

export type TrackRecord = Song & {
  liked: boolean;
  likedAt: number | null;
  playCount: number;
  lastPlayedAt: number | null;
  downloadStatus: 0 | 1 | 2; // 0 none, 1 downloading, 2 done
  localPath: string | null;
};

export function artworkFor(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0 || !isFinite(seconds)) return "--:--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
