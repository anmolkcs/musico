import type { SearchResult, SearchResultItem, StreamResult } from "./types";
import { guardedFetch } from "../../lib/fetch-guard";

export type { SearchResult, SearchResultItem, StreamResult };

// Web port of the native YtCore module (NewPipe extractor).
// Browsers cannot call YouTube's InnerTube API directly (CORS), so search and
// stream resolution go through public Piped/Invidious instances. Public
// instance health fluctuates (YouTube bot-checks their server IPs), so every
// call walks a provider chain and users can pin their own instance — see the
// "Web backend" option in Settings (stored in localStorage as "musico.backend").

type YtCoreWebModule = {
  search(query: string, filter: string): Promise<SearchResult>;
  getStream(videoId: string): Promise<StreamResult>;
};

const BACKEND_OVERRIDE_KEY = "musico.backend";

const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.ducks.party",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.drgns.space",
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://invidious.f5.si",
  "https://iv.melmac.space",
];

const REQUEST_TIMEOUT_MS = 9_000;
const FAILURE_PENALTY_MS = 5 * 60 * 1000;

// Skip instances that just failed, so a dead backend doesn't add its full
// timeout to every keystroke; last-good instances are tried first.
const failedUntil = new Map<string, number>();

function isPenalized(key: string): boolean {
  const until = failedUntil.get(key);
  return until !== undefined && until > Date.now();
}

function markFailed(key: string) {
  failedUntil.set(key, Date.now() + FAILURE_PENALTY_MS);
}

function markGood(key: string) {
  failedUntil.delete(key);
}

function backendOverride(): string | null {
  try {
    const value = window.localStorage.getItem(BACKEND_OVERRIDE_KEY)?.trim();
    return value ? value.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

function ordered(
  instances: string[],
  provider: "piped" | "invidious"
): { key: string; instance: string; overridden: boolean }[] {
  const override = provider === "piped" ? backendOverride() : null;
  const list: { key: string; instance: string; overridden: boolean }[] = [];
  if (override) list.push({ key: "piped:override", instance: override, overridden: true });
  for (const instance of instances) {
    list.push({ key: `${provider}:${instance}`, instance, overridden: false });
  }
  // Try healthy instances first; keep the override and any never-failed host
  // ahead of penalized ones, preserving list order otherwise.
  return [...list].sort((a, b) => Number(isPenalized(a.key)) - Number(isPenalized(b.key)));
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  // Shared guardrails (concurrency cap, timeout, GET dedup) on top of the
  // per-instance failure penalties below.
  const res = await guardedFetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } }, { timeoutMs });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function cleanArtist(name: string | null | undefined): string {
  const value = name ?? "";
  return value.endsWith(" - Topic") ? value.slice(0, -" - Topic".length) : value;
}

function videoIdFromWatchUrl(url: string): string {
  try {
    return new URL(url, "https://www.youtube.com").searchParams.get("v") ?? url;
  } catch {
    return url;
  }
}

// ---- Piped ----

type PipedSearchItem = {
  url?: string;
  type?: string; // "stream" | "channel" | "playlist"
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  duration?: number;
};

type PipedAudioStream = {
  url?: string;
  format?: string; // "M4A" | "WEBMA_OPUS" | "WEBMA" | ...
  mimeType?: string;
  bitrate?: number;
};

type PipedStreams = {
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnailUrl?: string;
  audioStreams?: PipedAudioStream[];
};

function pipedFilter(filter: string): string {
  switch (filter) {
    case "videos":
      return "music_videos";
    case "albums":
      return "music_playlists";
    case "artists":
      return "music_artists";
    default:
      return "music_songs";
  }
}

function pipedSearchItemToResult(item: PipedSearchItem): SearchResultItem | null {
  if (!item?.url || !item.title) return null;
  if (item.type === "channel") {
    return {
      id: item.url,
      url: `https://www.youtube.com${item.url}`,
      title: item.title,
      thumbnail: item.thumbnail ?? "",
      type: "artist",
      artist: item.title,
      duration: -1,
    };
  }
  if (item.type === "playlist") {
    return {
      id: item.url,
      url: `https://www.youtube.com${item.url}`,
      title: item.title,
      thumbnail: item.thumbnail ?? "",
      type: "album",
      artist: cleanArtist(item.uploaderName),
      duration: -1,
    };
  }
  const id = videoIdFromWatchUrl(item.url);
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: item.title,
    thumbnail: item.thumbnail ?? "",
    type: "song",
    artist: cleanArtist(item.uploaderName),
    duration: item.duration ?? 0,
  };
}

const FORMAT_SUFFIX: Record<string, string> = {
  M4A: "m4a",
  WEBMA_OPUS: "webm",
  WEBMA: "webm",
};

function formatSuffix(format: string | undefined, mimeType: string | undefined): string {
  if (format && FORMAT_SUFFIX[format]) return FORMAT_SUFFIX[format];
  if (mimeType?.includes("mp4") || mimeType?.includes("m4a")) return "m4a";
  if (mimeType?.includes("webm") || mimeType?.includes("opus")) return "webm";
  return "m4a";
}

/** Best audio stream: prefer m4a, then opus/webm, then anything — highest bitrate wins. */
function pickBestAudio<T extends { format?: string; mimeType?: string; type?: string; bitrate?: number; url?: string }>(
  streams: T[]
): T | null {
  const playable = streams.filter((s) => s.url);
  if (playable.length === 0) return null;
  const rank = (s: T) => {
    const mime = s.mimeType ?? s.type ?? "";
    if (s.format === "M4A" || mime.includes("mp4") || mime.includes("m4a")) return 0;
    if (s.format?.startsWith("WEBMA") || mime.includes("webm") || mime.includes("opus")) return 1;
    return 2;
  };
  for (const rankValue of [0, 1, 2]) {
    const candidates = playable.filter((s) => rank(s) === rankValue);
    if (candidates.length > 0) {
      return candidates.reduce((a, b) => ((b.bitrate ?? 0) > (a.bitrate ?? 0) ? b : a));
    }
  }
  return null;
}

async function pipedSearch(instance: string, query: string, filter: string): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, filter: pipedFilter(filter) });
  const data = await fetchJson<{ items?: PipedSearchItem[] }>(`${instance}/search?${params.toString()}`);
  const items = (data.items ?? [])
    .map(pipedSearchItemToResult)
    .filter((item): item is SearchResultItem => item !== null);
  return { query, filter, items };
}

async function pipedGetStream(instance: string, videoId: string): Promise<StreamResult> {
  const data = await fetchJson<PipedStreams>(`${instance}/streams/${encodeURIComponent(videoId)}`);
  const best = pickBestAudio(data.audioStreams ?? []);
  if (!best?.url) throw new Error("No audio streams returned");
  return {
    videoId,
    title: data.title ?? "",
    artist: cleanArtist(data.uploader),
    duration: data.duration ?? 0,
    thumbnail: data.thumbnailUrl ?? "",
    streamUrl: best.url,
    format: formatSuffix(best.format, best.mimeType),
    mimeType: best.mimeType ?? "",
    bitrate: best.bitrate ?? 0,
  };
}

// ---- Invidious ----

type InvidiousVideo = {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: { url?: string; quality?: string }[];
};

type InvidiousSearchItem = InvidiousVideo & { type?: string };

type InvidiousFormat = {
  itag?: string | number;
  type?: string;
  bitrate?: string | number;
  url?: string;
};

type InvidiousVideoDetails = InvidiousVideo & { adaptiveFormats?: InvidiousFormat[] };

function invidiousThumbnail(base: string, video: InvidiousVideo): string {
  const thumb = video.videoThumbnails?.find((t) => t.quality === "hqdefault") ?? video.videoThumbnails?.[0];
  const url = thumb?.url ?? "";
  return url.startsWith("http") ? url : `${base}${url}`;
}

async function invidiousSearch(instance: string, query: string, filter: string): Promise<SearchResult> {
  // Invidious has no YT Music filters; degrade gracefully to video search.
  const params = new URLSearchParams({ q: query, type: "video" });
  const list = await fetchJson<InvidiousSearchItem[]>(`${instance}/api/v1/search?${params.toString()}`);
  const items: SearchResultItem[] = (Array.isArray(list) ? list : [])
    .filter((item) => item.videoId && item.title)
    .map((item) => ({
      id: item.videoId!,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      title: item.title!,
      thumbnail: invidiousThumbnail(instance, item),
      type: "song",
      artist: cleanArtist(item.author),
      duration: item.lengthSeconds ?? 0,
    }));
  return { query, filter, items };
}

async function invidiousGetStream(instance: string, videoId: string): Promise<StreamResult> {
  const data = await fetchJson<InvidiousVideoDetails>(
    `${instance}/api/v1/videos/${encodeURIComponent(videoId)}`
  );
  const audio = (data.adaptiveFormats ?? []).filter((f) => f.type?.startsWith("audio/"));
  // Prefer itag 140 (m4a ~128k), then opus (251/250/249); play through the
  // instance proxy (`local=true`) because googlevideo URLs are IP-locked.
  const preferredItags = ["140", "251", "250", "249"];
  let chosen: InvidiousFormat | null = null;
  for (const itag of preferredItags) {
    chosen = audio.find((f) => String(f.itag) === itag) ?? null;
    if (chosen) break;
  }
  if (!chosen) {
    const best = pickBestAudio(
      audio.map((f) => ({
        itag: f.itag,
        url: f.url ?? "",
        type: f.type,
        bitrate: Math.round(Number(f.bitrate ?? 0) / 1000),
      }))
    );
    if (best?.itag !== undefined) {
      chosen = { itag: best.itag, url: best.url, type: best.type, bitrate: best.bitrate };
    }
  }
  if (!chosen?.itag) throw new Error("No audio streams returned");
  return {
    videoId,
    title: data.title ?? "",
    artist: cleanArtist(data.author),
    duration: data.lengthSeconds ?? 0,
    thumbnail: invidiousThumbnail(instance, data),
    streamUrl: `${instance}/latest_version?id=${encodeURIComponent(videoId)}&itag=${chosen.itag}&local=true`,
    format: chosen.type?.includes("mp4") || chosen.type?.includes("m4a") ? "m4a" : "webm",
    mimeType: chosen.type ?? "",
    bitrate: Math.round(Number(chosen.bitrate ?? 0) / 1000),
  };
}

// ---- Provider chain ----

async function withFallbacks<T>(
  providers: {
    key: string;
    run: () => Promise<T>;
    validate?: (result: T) => boolean;
    penalize?: boolean;
  }[],
  failMessage: string
): Promise<T> {
  let lastError: unknown = null;
  for (const provider of providers) {
    if (provider.penalize !== false && isPenalized(provider.key)) continue;
    try {
      const result = await provider.run();
      if (provider.validate && !provider.validate(result)) {
        throw new Error("Backend returned no usable data");
      }
      markGood(provider.key);
      return result;
    } catch (e) {
      if (provider.penalize !== false) markFailed(provider.key);
      lastError = e;
    }
  }
  throw new Error(
    `${failMessage}${lastError instanceof Error ? `: ${lastError.message}` : ""}`
  );
}

const YtCore: YtCoreWebModule = {
  async search(query: string, filter: string): Promise<SearchResult> {
    const piped = ordered(PIPED_INSTANCES, "piped").map(({ instance, overridden }) => ({
      key: `piped:${instance}`,
      run: () => pipedSearch(instance, query, filter),
      validate: (r: SearchResult) => r.items.length > 0,
      penalize: !overridden,
    }));
    const invidious = ordered(INVIDIOUS_INSTANCES, "invidious").map(({ instance }) => ({
      key: `invidious:${instance}`,
      run: () => invidiousSearch(instance, query, filter),
      validate: (r: SearchResult) => r.items.length > 0,
    }));
    return withFallbacks([...piped, ...invidious], "Search failed on all backends");
  },

  async getStream(videoId: string): Promise<StreamResult> {
    const piped = ordered(PIPED_INSTANCES, "piped").map(({ instance, overridden }) => ({
      key: `piped:${instance}`,
      run: () => pipedGetStream(instance, videoId),
      validate: (r: StreamResult) => !!r.streamUrl,
      penalize: !overridden,
    }));
    const invidious = ordered(INVIDIOUS_INSTANCES, "invidious").map(({ instance }) => ({
      key: `invidious:${instance}`,
      run: () => invidiousGetStream(instance, videoId),
      validate: (r: StreamResult) => !!r.streamUrl,
    }));
    return withFallbacks([...piped, ...invidious], "Could not resolve stream on all backends");
  },
};

export default YtCore;
