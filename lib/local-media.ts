import * as FileSystem from "expo-file-system/legacy";
import { getTrack, openDb, setDownloadStatus } from "./db";

/**
 * Returns a playable local URI for a downloaded track, or null when the track
 * has no usable local copy. On native this verifies the file still exists and
 * resets the download status when the file went missing.
 */
export async function getLocalPlayableUrl(id: string): Promise<string | null> {
  const db = await openDb();
  const track = await getTrack(db, id);
  if (track?.downloadStatus !== 2 || !track.localPath) return null;
  try {
    const info = await FileSystem.getInfoAsync(track.localPath);
    if (info.exists) return track.localPath;
    await setDownloadStatus(db, id, 0, null);
  } catch {}
  return null;
}
