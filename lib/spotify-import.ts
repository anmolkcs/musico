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

export type SpotifyKind = "playlist" | "album" | "track";

export type SpotifyTrack = {
  title: string;
  artist: string;
};

export type SpotifyCollection = {
  kind: SpotifyKind;
  name: string;
  tracks: SpotifyTrack[];
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

/** fetch() with a timeout that also respects an outer abort signal. */
async function fetchWithTimeout(url: string, init: RequestInit, outerSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Spotify took too long to respond.")), FETCH_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort(outerSignal?.reason);
  if (outerSignal) {
    if (outerSignal.aborted) {
      clearTimeout(timer);
      throw outerSignal.reason instanceof Error ? outerSignal.reason : new Error("Cancelled");
    }
    outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError" && !outerSignal?.aborted) {
      throw new Error("Spotify took too long to respond. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onOuterAbort);
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
  return { kind, name, tracks };
}
