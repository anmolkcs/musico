import { getTrack, openDb, setDownloadStatus } from "./db";
import { getLocalAudio } from "./media-store.web";

// Web counterpart of lib/local-media.ts. Downloaded audio lives as Blobs in an
// IndexedDB store (lib/media-store.web); playback uses short-lived object URLs
// created on demand and revoked when evicted.

const activeUrls = new Map<string, string>();

export async function getLocalPlayableUrl(id: string): Promise<string | null> {
  const db = await openDb();
  const track = await getTrack(db, id);
  if (track?.downloadStatus !== 2) return null;
  const stored = await getLocalAudio(id).catch(() => null);
  if (!stored) {
    // Status says downloaded but the blob is gone (cleared storage, etc.).
    await setDownloadStatus(db, id, 0, null).catch(() => {});
    return null;
  }
  const existing = activeUrls.get(id);
  if (existing) return existing;
  const mime = stored.ext === "webm" ? "audio/webm" : stored.ext === "ogg" ? "audio/ogg" : "audio/mp4";
  const url = URL.createObjectURL(new Blob([stored.blob], { type: mime }));
  // Bound the cache; object URLs are revoked when evicted.
  if (activeUrls.size >= 6) {
    const oldest = activeUrls.keys().next().value;
    if (oldest !== undefined) {
      const stale = activeUrls.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      activeUrls.delete(oldest);
    }
  }
  activeUrls.set(id, url);
  return url;
}
