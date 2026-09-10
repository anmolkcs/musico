/**
 * Spotify import WITHOUT a Spotify developer account.
 *
 * Spotify's official Web API needs OAuth + a registered app. Instead we use
 * the same public, unauthenticated endpoint that powers Spotify's own web
 * embed player (`open.spotify.com/embed/...`). It returns server-rendered
 * HTML containing the full track listing as JSON — no login, no client
 * secret, no dev dashboard.
 *
 * Limits (all inherent to Spotify, not to us):
 * - Only PUBLIC playlists/albums/tracks. "Liked Songs" is private to the
 *   account, so it can't be fetched by link. Workaround shown in the UI:
 *   select-all Liked Songs on desktop -> add to a new public playlist ->
 *   paste that link here.
 * - Big playlists still match one-by-one on YouTube (see import screen).
 */

import { guardedFetch } from "./fetch-guard";

export type SpotifyKind = "playlist" | "album" | "track";

export type SpotifyTrack = {
  title: string;
  artist: string;
};

export type SpotifyCollection = {
  kind: SpotifyKind;
  name: string;
  tracks: SpotifyTrack[];
  /** Total tracks Spotify reports (may exceed tracks.length when truncated). */
  totalCount?: number | null;
  /** True when Spotify exposed more tracks than we could fetch. */
  truncated?: boolean;
};

const ID_RE = /^[A-Za-z0-9]{10,30}$/;

/**
 * Parses user input into a Spotify kind + ID.
 * Returns null for non-Spotify input; throws for a bare ID (ambiguous kind).
 */
export function parseSpotifyInput(input: string): { kind: SpotifyKind; id: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // spotify:playlist:37i9dQZEVXbMDoHDwVN2tF
  const uri = trimmed.match(/^spotify:(playlist|album|track):([A-Za-z0-9]+)/);
  if (uri) return { kind: uri[1] as SpotifyKind, id: uri[2] };

  // Bare ID (user pasted just the ID). We can't tell playlist from
  // album/track, so ask for the full link instead of guessing wrong.
  if (ID_RE.test(trimmed)) {
    throw new Error(
      "Paste the full Spotify link (not just the ID) so we know whether it's a playlist, album, or track."
    );
  }

  // https://open.spotify.com/playlist/37i9..?si=.. (also /intl-*/ localized links)
  const url = trimmed.match(
    /open\.spotify\.com\/(?:intl-[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/
  );
  if (url) return { kind: url[1] as SpotifyKind, id: url[2] };

  return null;
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Spotify fetch through the shared guardrails (concurrency cap, timeout,
 * GET dedup). Timeout surfaces as AbortError from the guard, so a non-abort
 * outer signal means Spotify was slow — mapped to a friendly message here.
 */
async function fetchWithTimeout(url: string, init: RequestInit, outerSignal?: AbortSignal): Promise<Response> {
  try {
    return await guardedFetch(url, init, { timeoutMs: FETCH_TIMEOUT_MS, signal: outerSignal });
  } catch (e: any) {
    if (e?.name === "AbortError" && !outerSignal?.aborted) {
      throw new Error("Spotify took too long to respond. Check your connection and try again.");
    }
    throw e;
  }
}

type SpotifyEntity = {
  type?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  artists?: { name?: string }[];
  trackList?: { title?: string; name?: string; subtitle?: string; artists?: { name?: string }[] }[];
};

/** Extracts the embedded page-data JSON; tries multiple patterns since Spotify changes markup. */
function extractEntity(html: string): SpotifyEntity {
  const patterns = [
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
    /<script[^>]*type="application\/json"[^>]*>(\{"props":\{"pageProps":.*?\})<\/script>/s,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      const entity = JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity;
      if (entity && typeof entity === "object") return entity as SpotifyEntity;
    } catch {
      // Try the next pattern.
    }
  }
  throw new Error("Couldn't read that Spotify page. Spotify may have changed their format — try again later.");
}

function splitArtists(subtitle: string | undefined, artists: { name?: string }[] | undefined): string {
  if (artists && artists.length > 0) {
    return artists.map((a) => a?.name ?? "").filter(Boolean).join(", ");
  }
  return (subtitle ?? "").trim();
}

export async function fetchSpotifyCollection(
  input: string,
  signal?: AbortSignal
): Promise<SpotifyCollection> {
  const parsed = parseSpotifyInput(input);
  if (!parsed) {
    throw new Error("That doesn't look like a Spotify link. Paste a public playlist, album, or track link.");
  }
  const { kind, id } = parsed;

  // Playlists/albums can exceed the ~100 tracks the embed page
  // server-renders, so try the full paginated fetch first and fall back
  // to the embed page when it is unavailable.
  if (kind === "playlist") {
    try {
      const full = await fetchPlaylistFull(id, signal);
      if (full.tracks.length > 0) return { kind, ...full };
    } catch (e: any) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      // Fall through to the embed page.
    }
  } else if (kind === "album") {
    try {
      const full = await fetchAlbumFull(id, signal);
      if (full.tracks.length > 0) return { kind, ...full };
    } catch (e: any) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      // Fall through to the embed page.
    }
  }

  return fetchViaEmbed(kind, id, signal);
}

/**
 * Full playlist fetch via Spotify's partner API.
 *
 * The embed page only server-renders the first ~100 tracks, but the same
 * unauthenticated embed token
 * (`open.spotify.com/embed/api/token` — no login, no dev account) unlocks
 * paginated reads through `api-partner.spotify.com/pathfinder/v2/query`
 * (`fetchPlaylist`, 100 tracks per page). Throws when the paginated path
 * is unavailable so callers can fall back to the embed page.
 */
const PARTNER_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
const PLAYLIST_HASH = "346811f856fb0b7e4f6c59f8ebea78dd081c6e2fb01b77c954b26259d5fc6763";
const ALBUM_HASH = "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10";
const PAGE_LIMIT = 100;
const MAX_IMPORT_TRACKS = 1000;

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Test-only reset for the in-memory embed-token cache. */
export function _resetSpotifyTokenCache() {
  cachedToken = null;
}

async function getEmbedToken(signal?: AbortSignal): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await fetchWithTimeout(
    "https://open.spotify.com/embed/api/token",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://open.spotify.com/",
      },
    },
    signal
  );
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = (await (res as Response).json()) as {
    accessToken?: string;
    accessTokenExpirationTimestampMs?: number;
  };
  if (!data?.accessToken) throw new Error("token unavailable");
  cachedToken = {
    token: data.accessToken,
    expiresAt: (data.accessTokenExpirationTimestampMs ?? Date.now() + 50 * 60_000) - 60_000,
  };
  return cachedToken.token;
}

type PartnerPage = { name: string; totalCount: number | null; tracks: SpotifyTrack[]; hasMore: boolean };

async function fetchPlaylistPage(
  id: string,
  token: string,
  offset: number,
  signal?: AbortSignal
): Promise<PartnerPage> {
  const res = await fetchWithTimeout(
    PARTNER_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://open.spotify.com",
        Referer: "https://open.spotify.com/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "app-platform": "WebPlayer",
      },
      body: JSON.stringify({
        operationName: "fetchPlaylist",
        variables: { uri: `spotify:playlist:${id}`, offset, limit: PAGE_LIMIT, enableWatchFeedEntrypoint: true },
        extensions: { persistedQuery: { version: 1, sha256Hash: PLAYLIST_HASH } },
      }),
    },
    signal
  );
  if (!res.ok) throw new Error(`partner ${res.status}`);
  const data = (await (res as Response).json()) as any;
  const playlist = data?.data?.playlistV2;
  if (!playlist) throw new Error("playlist unavailable");
  const items: any[] = playlist?.content?.items ?? [];
  const totalCount: number | null =
    typeof playlist?.content?.totalCount === "number" ? playlist.content.totalCount : null;
  const tracks: SpotifyTrack[] = [];
  for (const item of items) {
    const t = item?.itemV2?.data;
    if (item?.itemV2?.__typename !== "TrackResponseWrapper" || !t || t.__typename === "NotFound") continue;
    const title = String(t?.name ?? "").trim();
    if (!title) continue;
    const artist = Array.isArray(t?.artists?.items)
      ? t.artists.items.map((a: any) => a?.profile?.name ?? "").filter(Boolean).join(", ")
      : "";
    tracks.push({ title, artist: artist.trim() });
  }
  return {
    name: String(playlist?.name ?? "Spotify import"),
    totalCount,
    tracks,
    hasMore: items.length >= PAGE_LIMIT,
  };
}

async function fetchPlaylistFull(
  id: string,
  signal?: AbortSignal
): Promise<{ name: string; tracks: SpotifyTrack[]; totalCount?: number | null; truncated?: boolean }> {
  const token = await getEmbedToken(signal);
  const tracks: SpotifyTrack[] = [];
  let name = "Spotify import";
  let totalCount: number | null = null;
  let offset = 0;
  for (;;) {
    if (signal?.aborted) throw new Error("Cancelled");
    const page = await fetchPlaylistPage(id, token, offset, signal);
    name = page.name || name;
    if (totalCount == null) totalCount = page.totalCount;
    tracks.push(...page.tracks);
    offset += PAGE_LIMIT;
    if (tracks.length >= MAX_IMPORT_TRACKS) {
      return { name, tracks: tracks.slice(0, MAX_IMPORT_TRACKS), totalCount, truncated: true };
    }
    if (!page.hasMore) break;
    if (totalCount != null && offset >= totalCount) break;
    // Be gentle with the partner API between pages.
    await new Promise((r) => setTimeout(r, 120));
  }
  if (tracks.length === 0) throw new Error("No tracks found.");
  const truncated = totalCount != null && totalCount > tracks.length;
  return { name, tracks, totalCount, truncated: truncated || undefined };
}

async function fetchAlbumFull(
  id: string,
  signal?: AbortSignal
): Promise<{ name: string; tracks: SpotifyTrack[]; totalCount?: number | null; truncated?: boolean }> {
  const token = await getEmbedToken(signal);
  const res = await fetchWithTimeout(
    PARTNER_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://open.spotify.com",
        Referer: "https://open.spotify.com/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "app-platform": "WebPlayer",
      },
      body: JSON.stringify({
        operationName: "getAlbum",
        variables: { uri: `spotify:album:${id}`, locale: "", offset: 0, limit: 50 },
        extensions: { persistedQuery: { version: 1, sha256Hash: ALBUM_HASH } },
      }),
    },
    signal
  );
  if (!res.ok) throw new Error(`partner ${res.status}`);
  const data = (await (res as Response).json()) as any;
  const album = data?.data?.albumUnion;
  if (!album) throw new Error("album unavailable");
  const items: any[] = album?.tracksV2?.items ?? [];
  const artistFallback = Array.isArray(album?.artists?.items)
    ? album.artists.items.map((a: any) => a?.profile?.name ?? "").filter(Boolean).join(", ")
    : "";
  const tracks: SpotifyTrack[] = [];
  for (const item of items) {
    const t = item?.track;
    const title = String(t?.name ?? "").trim();
    if (!title) continue;
    const artist = Array.isArray(t?.artists?.items)
      ? t.artists.items.map((a: any) => a?.profile?.name ?? "").filter(Boolean).join(", ")
      : artistFallback;
    tracks.push({ title, artist: artist.trim() });
  }
  if (tracks.length === 0) throw new Error("No tracks found.");
  const totalCount: number | null =
    typeof album?.tracksV2?.totalCount === "number" ? album.tracksV2.totalCount : null;
  const truncated = totalCount != null && totalCount > tracks.length;
  return { name: String(album?.name ?? "Spotify import"), tracks, totalCount, truncated: truncated || undefined };
}

const EMBED_CAP = 100;

async function fetchViaEmbed(
  kind: SpotifyKind,
  id: string,
  signal?: AbortSignal
): Promise<SpotifyCollection> {
  const res = await fetchWithTimeout(
    `https://open.spotify.com/embed/${kind}/${id}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
    signal
  );
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Spotify couldn't find that link. Make sure the playlist/album is public.");
    }
    throw new Error(`Spotify returned ${res.status}. Check your connection and try again.`);
  }
  const html = await res.text();
  const entity = extractEntity(html);

  const name: string = entity.name ?? entity.title ?? "Spotify import";
  const rawList = Array.isArray(entity.trackList) ? entity.trackList : [];
  let tracks: SpotifyTrack[];
  if (rawList.length > 0) {
    tracks = rawList
      .map((t) => ({
        title: String(t?.title ?? t?.name ?? "").trim(),
        artist: splitArtists(t?.subtitle, t?.artists).trim(),
      }))
      .filter((t) => t.title.length > 0);
  } else if (entity.type === "track" || kind === "track") {
    // Single track link: the entity itself is the track.
    const title = String(entity.name ?? entity.title ?? "").trim();
    if (!title) throw new Error("Couldn't read any tracks from that link.");
    tracks = [{ title, artist: splitArtists(entity.subtitle, entity.artists).trim() }];
  } else {
    throw new Error("No tracks found. Private or empty collections can't be imported — make it public first.");
  }
  if (tracks.length === 0) {
    throw new Error("No tracks found. Private or empty collections can't be imported — make it public first.");
  }
  // The embed page only server-renders the first ~100 tracks. When we hit
  // that cap the playlist is probably longer — the paginated path above
  // already tried, so flag it honestly instead of silently dropping songs.
  const truncated = kind === "playlist" && rawList.length >= EMBED_CAP ? true : undefined;
  return { kind, name, tracks, truncated };
}
