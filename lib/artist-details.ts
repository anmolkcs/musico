import { getCachedArtistDetails, openDb, saveArtistDetails } from "./db";
import { guardedFetch } from "./fetch-guard";

export type ArtistDetails = {
  name: string;
  imageUrl: string | null;
  biography: string | null;
  genres: string[];
  country: string | null;
  formed: string | null;
  website: string | null;
  albumCount: number | null;
  fanCount: number | null;
};

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 8_000;
const pendingRequests = new Map<string, Promise<ArtistDetails>>();

function emptyDetails(name: string): ArtistDetails {
  return {
    name,
    imageUrl: null,
    biography: null,
    genres: [],
    country: null,
    formed: null,
    website: null,
    albumCount: null,
    fanCount: null,
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await guardedFetch(
      url,
      { headers: { "User-Agent": "Musico/1.0 (personal project)" } },
      { timeoutMs: REQUEST_TIMEOUT }
    );
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type DeezerArtist = {
  name?: string;
  picture_xl?: string;
  picture_big?: string;
  link?: string;
  nb_album?: number;
  nb_fan?: number;
};

type DeezerSearch = { data?: DeezerArtist[] };
type MusicBrainzArtist = {
  country?: string;
  "life-span"?: { begin?: string };
  tags?: { name?: string; count?: number }[];
};
type MusicBrainzSearch = { artists?: MusicBrainzArtist[] };
type WikipediaSummary = { extract?: string; content_urls?: { desktop?: { page?: string } } };

async function fetchArtistDetails(name: string, fallbackImage: string | null): Promise<ArtistDetails> {
  const details = emptyDetails(name);
  details.imageUrl = fallbackImage;

  const [deezer, musicBrainz, wiki] = await Promise.all([
    fetchJson<DeezerSearch>(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}`
    ).catch(() => null),
    fetchJson<MusicBrainzSearch>(
      `https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(name)}&fmt=json&limit=1`
    ).catch(() => null),
    fetchJson<WikipediaSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`
    ).catch(() => null),
  ]);
  const artist = deezer?.data?.[0];
  if (artist) {
    // Keep the known-good app image when provided (e.g., from search results).
    if (!details.imageUrl) {
      details.imageUrl = artist.picture_xl || artist.picture_big || details.imageUrl;
    }
    details.website = artist.link ?? null;
    details.albumCount = artist.nb_album ?? null;
    details.fanCount = artist.nb_fan ?? null;
  }

  const match = musicBrainz?.artists?.[0];
  if (match) {
    details.country = match.country ?? null;
    details.formed = match["life-span"]?.begin ?? null;
    details.genres = (match.tags ?? [])
      .filter((tag) => tag.name)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 4)
      .map((tag) => tag.name as string);
  }

  details.biography = wiki?.extract ?? null;
  if (!details.website) details.website = wiki?.content_urls?.desktop?.page ?? null;
  return details;
}

export async function getArtistDetails(name: string, fallbackImage?: string): Promise<ArtistDetails> {
  const normalized = name.trim();
  const fallback = fallbackImage || null;
  if (!normalized) return emptyDetails("Unknown artist");

  const db = await openDb();
  const cached = await getCachedArtistDetails(db, normalized);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    try {
      const details = JSON.parse(cached.data) as ArtistDetails;
      return { ...emptyDetails(normalized), ...details, imageUrl: fallback || details.imageUrl || null };
    } catch {
      // Fetch and replace malformed cache data.
    }
  }

  const pending = pendingRequests.get(normalized.toLowerCase());
  if (pending) {
    const details = await pending;
    return { ...details, imageUrl: fallback || details.imageUrl || null };
  }

  const request = (async () => {
    const details = await fetchArtistDetails(normalized, fallback);
    await saveArtistDetails(db, normalized, JSON.stringify(details));
    return details;
  })();
  pendingRequests.set(normalized.toLowerCase(), request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(normalized.toLowerCase());
  }
}
