/**
 * Song artwork via JioSaavn (same source saavn-dl uses).
 *
 * YouTube thumbnails (`hqdefault.jpg`) are letterboxed 480x360 stills, so
 * song art looks washed out. JioSaavn's CDN serves proper square cover art:
 * search `api.php?__call=search.getResults` (no key, no login) returns an
 * `image` per track sized `150x150`, and the CDN honors size swaps —
 * `150x150` -> `500x500` — which is exactly how saavn-dl gets full-res art.
 *
 * Display-layer only: callers keep their current YouTube thumbnail and swap
 * in the Saavn URL when (and only when) one resolves. Anything that fails —
 * network, no match, bad art — resolves null and the caller keeps showing
 * its existing thumbnail. Videos/album/artist rows must opt out via
 * `enabled = false`.
 *
 * Abuse guards (undocumented endpoint, shared quota):
 * - Mount debounce (350ms): rows scrolled past quickly never fire.
 * - Global concurrency cap (10 in-flight, rest queue FIFO).
 * - Errors are NEVER cached; definitive no-matches expire after 10 min.
 */
import React from "react";

const API_URL = "https://www.jiosaavn.com/api.php";
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_MAX = 300;
const NO_MATCH_TTL_MS = 10 * 60_000;
const HIT_TTL_MS = 24 * 3600_000;
const MAX_CONCURRENT = 10;
const MOUNT_DEBOUNCE_MS = 350;

type SaavnResult = {
  title?: string;
  subtitle?: string;
  type?: string;
  image?: string;
  more_info?: { duration?: string };
};

type CacheEntry = { url: string | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<string | null>>();

/** Test-only reset for the in-memory artwork cache. */
export function _resetSaavnCache() {
  cache.clear();
  pending.clear();
}

// ---- Concurrency limiter: at most MAX_CONCURRENT fetches at once ----

let activeCount = 0;
const waiters: Array<() => void> = [];

function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeCount >= MAX_CONCURRENT) {
    return new Promise<T>((resolve, reject) => {
      waiters.push(() => {
        withSlot(task).then(resolve, reject);
      });
    });
  }
  activeCount += 1;
  const done = () => {
    activeCount -= 1;
    waiters.shift()?.();
  };
  return task().then(
    (value) => {
      done();
      return value;
    },
    (error) => {
      done();
      throw error;
    }
  );
}

// ---- Cache with TTL + recency refresh ----

function readCache(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  // Refresh recency so hot entries survive eviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function writeCache(key: string, entry: CacheEntry) {
  if (cache.has(key)) cache.delete(key);
  else {
    while (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }
  cache.set(key, entry);
}

export function cacheKey(title: string, artist: string): string {
  // Noise-normalized so "X (Official Video)" and "X" share one entry.
  return `${normalizeTitle(title).join(" ")}::${artistTokens(artist).join(" ")}`;
}

/** Synchronous cache peek so hooks can render a hit without flashing. */
export function peekSaavnArtwork(title: string, artist: string): string | null | undefined {
  return readCache(cacheKey(title, artist))?.url;
}

/**
 * Swaps a Saavn CDN image to full resolution.
 * `...-150x150.jpg` -> `...-500x500.jpg`. Unrecognized shapes pass through
 * unchanged (a smaller real image beats a manufactured 404).
 */
export function upscaleSaavnImage(url: string): string {
  return url.replace(/-\d+x\d+(\.[a-zA-Z]+)?$/, "-500x500$1");
}

const ENTITY_RE: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "…",
  ndash: "–",
  mdash: "—",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITY_RE[name] ?? m);
}

// Suffixes YouTube tacks onto song titles that never match Saavn titles.
const NOISE_RE =
  /\b(official\s+(music\s+)?video|official\s+audio|official\s+lyric(s)?\s+video|lyric(s)?\s+video|lyrics?|audio|visualizer|visualiser|music\s+video|m\/v|topic|full\s+album|hd|4k)\b/gi;

export function normalizeTitle(raw: string): string[] {
  const cleaned = decodeEntities(raw)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(NOISE_RE, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return cleaned ? cleaned.split(" ") : [];
}

const ARTIST_STOPWORDS = new Set(["ft", "feat", "featuring", "vs", "x", "and", "with", "plus"]);

function artistTokens(raw: string): string[] {
  return decodeEntities(raw)
    .split(/[,/&;|+]/)
    .flatMap((part) =>
      part
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .split(" ")
    )
    .filter((t) => t.length > 0 && !ARTIST_STOPWORDS.has(t));
}

const MIN_SCORE = 1.0;
const DURATION_TOLERANCE_SEC = 15;

function resultDurationSec(result: SaavnResult): number {
  const raw = result.more_info?.duration;
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Title overlap (0..1) plus an artist bonus (0..0.4), minus a penalty for
 * extra tokens so exact titles outrank same-name remixes/editions.
 *
 * Returns 0 (no art) unless the match is confident: short titles need
 * artist evidence, durations must roughly agree when both are known, and
 * the total must clear MIN_SCORE. A miss shows the existing thumbnail,
 * which is always safer than a confidently-wrong cover.
 */
export function scoreResult(
  title: string,
  artist: string,
  result: SaavnResult,
  durationSec = 0
): number {
  const queryTokens = normalizeTitle(title);
  if (queryTokens.length === 0) return 0;
  const hitTokens = new Set(normalizeTitle(result.title ?? ""));
  if (hitTokens.size === 0) return 0;
  const overlapCount = queryTokens.filter((t) => hitTokens.has(t)).length;
  const overlap = overlapCount / queryTokens.length;
  if (overlap < 0.6) return 0;
  let bonus = 0;
  const wanted = artistTokens(artist);
  if (wanted.length > 0) {
    const haystack = `${result.subtitle ?? ""} ${result.title ?? ""}`.toLowerCase();
    const matched = wanted.filter((t) => haystack.includes(t)).length;
    bonus = 0.4 * (matched / wanted.length);
  } else if (queryTokens.length <= 2) {
    // A one- or two-word title with no artist to check against ("Lights",
    // "Heat") matches far too much — require artist evidence.
    return 0;
  }
  if (durationSec > 0) {
    const candidate = resultDurationSec(result);
    if (candidate > 0 && Math.abs(candidate - durationSec) > DURATION_TOLERANCE_SEC) return 0;
  }
  // Prefer exact titles over same-name remixes/editions.
  const extraPenalty = Math.min(0.3, 0.05 * Math.max(0, hitTokens.size - overlapCount));
  const score = overlap - extraPenalty + bonus;
  return score >= MIN_SCORE ? score : 0;
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    return await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

function devWarn(...args: unknown[]) {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[saavn-art]", ...args);
}

/**
 * Resolves a 500x500 Saavn cover URL, or null when anything goes wrong.
 * Only definitive outcomes are cached (hits ~24h, no-matches 10min);
 * transient errors (!ok, bad JSON, abort, offline) are never cached so the
 * next mount retries.
 */
export async function fetchSaavnArtwork(
  title: string,
  artist: string,
  durationSec = 0,
  signal?: AbortSignal
): Promise<string | null> {
  const key = cacheKey(title, artist);
  if (!key.trim()) return null;
  const hit = readCache(key);
  if (hit) return hit.url;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const run = (async () => {
    try {
      const params = new URLSearchParams({
        __call: "search.getResults",
        q: `${title} ${artist}`.trim(),
        p: "1",
        n: "6",
        _format: "json",
        _marker: "0",
        api_version: "4",
        ctx: "web6dot0",
      });
      const res = await withSlot(() => fetchWithTimeout(`${API_URL}?${params.toString()}`, signal));
      if (!res.ok) {
        devWarn("search failed", res.status);
        return null;
      }
      let data: { results?: SaavnResult[] };
      try {
        data = (await res.json()) as { results?: SaavnResult[] };
      } catch {
        return null;
      }
      const results = Array.isArray(data?.results) ? data.results! : [];
      let best: { url: string; score: number } | null = null;
      for (const r of results) {
        if (r?.type && r.type !== "song") continue;
        const image = typeof r?.image === "string" ? r.image.trim() : "";
        if (!image || !image.includes("saavncdn.com")) continue;
        const score = scoreResult(title, artist, r, durationSec);
        if (score <= 0) continue;
        if (!best || score > best.score) best = { url: upscaleSaavnImage(image), score };
      }
      if (!best) {
        // Definitive no-match for this query — back off, don't hammer.
        writeCache(key, { url: null, expiresAt: Date.now() + NO_MATCH_TTL_MS });
        return null;
      }
      writeCache(key, { url: best.url, expiresAt: Date.now() + HIT_TTL_MS });
      return best.url;
    } catch {
      // Network blip, abort, timeout: never cached, next mount retries.
      return null;
    }
  })();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }
}

/**
 * Hook version: returns the Saavn cover URL once resolved (null while
 * loading or when unavailable). The lookup is debounced past mount so rows
 * scrolled by quickly never hit the network. Pass `enabled = false` for
 * videos and any other non-song rows — their YouTube thumbnails stay
 * untouched.
 */
export function useSaavnArtwork(
  title: string | undefined,
  artist: string | undefined,
  enabled = true,
  durationSec = 0
): string | null {
  const rawTitle = enabled ? (title ?? "").trim() : "";
  const rawArtist = enabled ? (artist ?? "").trim() : "";
  const key = rawTitle ? cacheKey(rawTitle, rawArtist) : "";
  const [url, setUrl] = React.useState<string | null>(() => (key ? (readCache(key)?.url ?? null) : null));
  React.useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }
    const cached = readCache(key);
    if (cached) {
      setUrl(cached.url);
      return;
    }
    setUrl(null);
    let alive = true;
    const timer = setTimeout(() => {
      fetchSaavnArtwork(rawTitle, rawArtist, durationSec)
        .then((resolved) => {
          if (alive) setUrl(resolved);
        })
        .catch(() => {
          if (alive) setUrl(null);
        });
    }, MOUNT_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, rawTitle, rawArtist, durationSec]);
  return url;
}
