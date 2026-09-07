import { openDb, getCachedLyrics, saveLyrics, getLyricsCacheAge } from "./db";
import { Song } from "./types";
import { parseLrc, serializeLrc } from "./lrc";
import type { LyricLine } from "./lrc";

export type { LyricLine };
export { parseLrc, activeLineIndex } from "./lrc";

export type LyricsResult = {
  synced: LyricLine[] | null;
  plain: string | null;
};

const FETCH_TIMEOUT_MS = 10_000;

function timeoutSignal(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
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
  {
    const { signal, done } = timeoutSignal();
    try {
      const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        headers: headers(),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.syncedLyrics || data.plainLyrics)) return data;
      }
    } catch {
    } finally {
      done();
    }
  }
  // Fuzzy fallback: search endpoint
  const { signal, done } = timeoutSignal();
  try {
    const q = new URLSearchParams({ q: `${song.title} ${song.artist}`.trim() });
    const res = await fetch(`https://lrclib.net/api/search?${q.toString()}`, {
      headers: headers(),
      signal,
    });
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
  } catch {
  } finally {
    done();
  }
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
  if (cached) {
    // A row exists even when nothing was found, so lyric-less tracks don't
    // re-hit LRCLIB on every view (entries older than a week are retried).
    const age = await getLyricsCacheAge(db, song.id);
    const NOT_FOUND_TTL = 7 * 24 * 60 * 60 * 1000;
    if (cached.synced || cached.plain || (age !== null && age < NOT_FOUND_TTL)) {
      return {
        synced: cached.synced ? parseLrc(cached.synced) : null,
        plain: cached.plain,
      };
    }
  }
  const result = await fetchLyrics(song);
  await saveLyrics(
    db,
    song.id,
    result.synced ? serializeLrc(result.synced) : null,
    result.plain
  );
  return result;
}
