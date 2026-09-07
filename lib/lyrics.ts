import { openDb, getCachedLyrics, saveLyrics } from "./db";
import { Song } from "./types";

export type LyricLine = { time: number; text: string };

export type LyricsResult = {
  synced: LyricLine[] | null;
  plain: string | null;
};

const LRC_LINE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    LRC_LINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    const stamps: number[] = [];
    while ((match = LRC_LINE.exec(raw)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const fracRaw = match[3] ?? "0";
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      stamps.push(min * 60 + sec + frac);
    }
    const text = raw.replace(LRC_LINE, "").trim();
    for (const time of stamps) lines.push({ time, text });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function headers(): HeadersInit {
  return {
    "User-Agent": "Musico/1.0 (personal project)",
  };
}

async function lrclibGet(song: Song): Promise<any | null> {
  const params = new URLSearchParams({
    track_name: song.title,
    artist_name: song.artist || "",
  });
  if (song.duration > 0) params.set("duration", String(Math.round(song.duration)));
  try {
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, { headers: headers() });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.syncedLyrics || data.plainLyrics)) return data;
    }
  } catch {}
  // Fuzzy fallback: search endpoint
  try {
    const q = new URLSearchParams({ q: `${song.title} ${song.artist}`.trim() });
    const res = await fetch(`https://lrclib.net/api/search?${q.toString()}`, { headers: headers() });
    if (res.ok) {
      const list = (await res.json()) as any[];
      if (Array.isArray(list) && list.length > 0) {
        // Pick closest by duration when possible
        let best = list[0];
        if (song.duration > 0) {
          let bestDiff = Infinity;
          for (const item of list) {
            const diff = Math.abs((item.duration ?? 0) - song.duration);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = item;
            }
          }
        }
        return best;
      }
    }
  } catch {}
  return null;
}

export async function fetchLyrics(song: Song): Promise<LyricsResult> {
  const data = await lrclibGet(song);
  if (!data) return { synced: null, plain: null };
  return {
    synced: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null,
    plain: data.plainLyrics ?? null,
  };
}

export async function getLyrics(song: Song): Promise<LyricsResult> {
  const db = await openDb();
  const cached = await getCachedLyrics(db, song.id);
  if (cached && (cached.synced || cached.plain)) {
    return {
      synced: cached.synced ? parseLrc(cached.synced) : null,
      plain: cached.plain,
    };
  }
  const result = await fetchLyrics(song);
  await saveLyrics(
    db,
    song.id,
    result.synced ? result.synced.map((l) => `[${Math.floor(l.time / 60)}:${(l.time % 60).toFixed(2).padStart(5, "0")}]${l.text}`).join("\n") : null,
    result.plain
  );
  return result;
}
